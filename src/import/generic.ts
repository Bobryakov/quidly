// Универсальный импорт CSV / Excel: человек сам указывает, в какой колонке что лежит.
// Колонки угадываются по названиям, но всегда можно поправить.

import { isNegativeAmount, parseBankAmount, parseBankDate, parseBankTime } from './normalize'
import type { ParsedRow, ParsedStatement } from './types'

export type Cell = string | number | boolean | Date | null | undefined
export type Table = Cell[][]

/** Байты CSV → текст: сначала UTF-8, если не получилось — Windows-1251 (частая кодировка русских банков). */
export function decodeText(bytes: ArrayBuffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1251').decode(bytes)
  }
  return text.replace(/^﻿/, '')
}

export async function parseCsv(text: string): Promise<Table> {
  const Papa = (await import('papaparse')).default
  const res = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' })
  return res.data
}

export async function parseXlsx(bytes: ArrayBuffer): Promise<Table> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: '' })
}

export type Mapping = {
  date: number
  description: number
  /** Одна колонка суммы со знаком (−/+) */
  amount?: number
  /** Или две колонки: поступления и списания */
  income?: number
  expense?: number
  category?: number
  mcc?: number
  /** true — в колонке суммы расходы записаны без минуса, а поступления помечены «+» или наоборот не различаются */
  expensesPositive?: boolean
}

const HEAD = {
  date: /^дата( операции| совершения| транзакции)?$|^date|дата операции/i,
  amount: /^сумма( операции)?$|сумма операции|^amount/i,
  income: /приход|поступлен|зачислен|^кредит/i,
  expense: /расход|списан|^дебет/i,
  description: /описание|назначение|контрагент|^description|получатель|место/i,
  category: /категория|category/i,
  mcc: /^mcc/i,
}

const cellText = (c: Cell) => (c instanceof Date ? c.toISOString() : String(c ?? '')).trim()

/** Строка с заголовками — первая из первых 30, где узнаются хотя бы дата и сумма/описание. */
export function findHeaderRow(table: Table): number {
  for (let i = 0; i < Math.min(30, table.length); i++) {
    const cells = table[i].map(cellText)
    const has = (r: RegExp) => cells.some((c) => r.test(c))
    if (has(HEAD.date) && (has(HEAD.amount) || has(HEAD.income) || has(HEAD.description))) return i
  }
  return 0
}

export function guessMapping(header: Cell[]): Partial<Mapping> {
  const cells = header.map(cellText)
  const find = (r: RegExp, not?: RegExp) => {
    const i = cells.findIndex((c) => r.test(c) && !(not && not.test(c)))
    return i >= 0 ? i : undefined
  }
  const m: Partial<Mapping> = {
    date: find(/дата операции/i) ?? find(HEAD.date, /обработк|списан|платеж/i),
    description: find(HEAD.description),
    category: find(HEAD.category),
    mcc: find(HEAD.mcc),
  }
  const amount = find(/сумма операции/i) ?? find(HEAD.amount, /кешб|бонус|округл|комисс/i)
  const income = find(HEAD.income)
  const expense = find(HEAD.expense)
  if (income !== undefined && expense !== undefined && income !== expense) {
    m.income = income
    m.expense = expense
  } else m.amount = amount
  return m
}

/** Строки таблицы → операции. Строки без даты или суммы пропускаются (подписи, итоги). */
export function mapTable(table: Table, headerRow: number, map: Mapping): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = []
  let skipped = 0
  for (const r of table.slice(headerRow + 1)) {
    const date = parseBankDate(r[map.date])
    let amount: number | null = null
    let direction: 'in' | 'out' = 'out'
    if (map.amount !== undefined) {
      const raw = r[map.amount]
      const text = typeof raw === 'number' ? String(raw) : cellText(raw)
      amount = parseBankAmount(text)
      const negative = typeof raw === 'number' ? raw < 0 : isNegativeAmount(text)
      const plus = /^\s*\+/.test(text)
      direction = map.expensesPositive ? (plus ? 'in' : 'out') : negative ? 'out' : 'in'
    } else if (map.income !== undefined && map.expense !== undefined) {
      const inc = parseBankAmount(cellText(r[map.income]))
      const exp = parseBankAmount(cellText(r[map.expense]))
      if (inc) {
        amount = inc
        direction = 'in'
      } else if (exp) {
        amount = exp
        direction = 'out'
      }
    }
    if (!date || !amount) {
      skipped++
      continue
    }
    const description = cellText(r[map.description]) || '(без описания)'
    const category = map.category !== undefined ? cellText(r[map.category]) : ''
    const mcc = map.mcc !== undefined ? cellText(r[map.mcc]).replace(/\D/g, '') : ''
    const time = parseBankTime(r[map.date])
    rows.push({
      date,
      ...(time && time !== '00:00' ? { time } : {}),
      amount,
      direction,
      description,
      ...(category ? { bankCategory: category } : {}),
      ...(mcc ? { mcc } : {}),
    })
  }
  return { rows, skipped }
}

export function genericStatement(rows: ParsedRow[]): ParsedStatement {
  return { bank: 'generic', bankName: 'Файл', rows }
}

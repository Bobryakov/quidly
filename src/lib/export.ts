import type { Account, Category, Transaction } from '../db/types'
import { isoToRu, monthKey, shiftMonth } from './dates'

/** Выгрузка операций в таблицу (Excel или CSV) за выбранный период. */

export type PeriodPreset = 'month' | 'prevMonth' | 'year' | 'all' | 'custom'

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'month', label: 'Этот месяц' },
  { value: 'prevMonth', label: 'Прошлый месяц' },
  { value: 'year', label: 'Этот год' },
  { value: 'all', label: 'Всё время' },
  { value: 'custom', label: 'Свои даты' },
]

function lastDay(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

/** Границы периода включительно. Для «всего времени» — от первой до последней операции. */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: string, transactions: Transaction[]): { from: string; to: string } {
  const month = monthKey(today)
  if (preset === 'month') return { from: `${month}-01`, to: lastDay(month) }
  if (preset === 'prevMonth') {
    const prev = shiftMonth(month, -1)
    return { from: `${prev}-01`, to: lastDay(prev) }
  }
  if (preset === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
  const dates = transactions.map((t) => t.date).sort()
  return { from: dates[0] ?? today, to: dates[dates.length - 1] ?? today }
}

export interface ExportRow {
  /** 'ГГГГ-ММ-ДД' */
  date: string
  type: 'Расход' | 'Доход' | 'Перевод'
  /** копейки; расход — с минусом */
  amount: number
  account: string
  toAccount: string
  category: string
  comment: string
}

export const EXPORT_HEADERS = ['Дата', 'Тип', 'Сумма, ₽', 'Счёт', 'Куда (перевод)', 'Категория', 'Комментарий']

const TYPE: Record<Transaction['type'], ExportRow['type']> = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' }

export function exportRows(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  from: string,
  to: string,
): ExportRow[] {
  const acc = new Map(accounts.map((a) => [a.id, a.name]))
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  return transactions
    .filter((t) => t.date >= from && t.date <= to)
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((t) => ({
      date: t.date,
      type: TYPE[t.type],
      amount: t.type === 'expense' ? -t.amount : t.amount,
      account: acc.get(t.accountId) ?? '',
      toAccount: t.toAccountId ? (acc.get(t.toAccountId) ?? '') : '',
      category: t.categoryId ? (cat.get(t.categoryId) ?? '') : '',
      comment: t.comment ?? '',
    }))
}

/**
 * Текст, который Excel может принять за формулу (начинается с = + - @), защищаем апострофом.
 * Так описание из выписки не превратится в «исполняемую» формулу при открытии файла.
 */
export function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function rubles(kop: number): string {
  const sign = kop < 0 ? '-' : ''
  const abs = Math.abs(kop)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

function csvCell(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV для русского Excel: разделитель «;», дробная часть через запятую, даты ДД.ММ.ГГГГ.
 * В начале — невидимая метка UTF-8, иначе Excel покажет кракозябры вместо кириллицы.
 */
export function toCsv(rows: ExportRow[]): string {
  const lines = [EXPORT_HEADERS.join(';')]
  for (const r of rows) {
    lines.push(
      [isoToRu(r.date), r.type, rubles(r.amount), safeText(r.account), safeText(r.toAccount), safeText(r.category), safeText(r.comment)]
        .map(csvCell)
        .join(';'),
    )
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Дата для Excel: число дней с 30.12.1899 (так Excel хранит даты). */
export function excelSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000)
}

/** Файл Excel (.xlsx). Библиотека тяжёлая — грузится только при экспорте. */
export async function toXlsx(rows: ExportRow[]): Promise<Uint8Array<ArrayBuffer>> {
  const XLSX = await import('xlsx')
  const aoa: (string | number)[][] = [
    EXPORT_HEADERS,
    ...rows.map((r) => [excelSerial(r.date), r.type, r.amount / 100, r.account, r.toAccount, r.category, r.comment]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  for (let i = 1; i <= rows.length; i++) {
    const d = ws[XLSX.utils.encode_cell({ r: i, c: 0 })]
    d.t = 'n'
    d.z = 'dd.mm.yyyy'
    ws[XLSX.utils.encode_cell({ r: i, c: 2 })].z = '#,##0.00'
  }
  ws['!cols'] = [{ wch: 11 }, { wch: 9 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 40 }]
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: EXPORT_HEADERS.length - 1 } }) }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Операции')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

export function exportFileName(from: string, to: string, ext: 'xlsx' | 'csv'): string {
  return `quidly-operacii_${from}_${to}.${ext}`
}

export const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  json: 'application/json',
} as const

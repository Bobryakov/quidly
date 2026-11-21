import { describe, expect, it } from 'vitest'
import type { Account, Category, Transaction } from '../db/types'
import { excelSerial, exportRows, presetRange, safeText, toCsv, toXlsx } from './export'

const acc = (id: string, name: string): Account => ({ id, name, type: 'card', emoji: '💳', color: '#000', initialBalance: 0, archived: false, order: 0, createdAt: 0 })
const cat = (id: string, name: string): Category => ({ id, name, kind: 'expense', emoji: '🛒', color: '#000', order: 0, createdAt: 0 })
let n = 0
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 100,
  date: '2026-11-10',
  accountId: 'card',
  createdAt: n,
  updatedAt: n,
  ...p,
})

const accounts = [acc('card', 'Сбер'), acc('cash', 'Наличные')]
const categories = [cat('food', 'Продукты')]
const txs = [
  tx({ amount: 123456, date: '2026-11-03', categoryId: 'food', comment: 'PYATEROCHKA; "у дома"' }),
  tx({ type: 'income', amount: 5000000, date: '2026-11-01', comment: '=1+1' }),
  tx({ type: 'transfer', amount: 300000, date: '2026-11-02', toAccountId: 'cash' }),
  tx({ amount: 99, date: '2026-10-31', categoryId: 'food' }),
]

describe('экспорт операций', () => {
  it('строки за период по порядку дат, расход с минусом, названия вместо id', () => {
    const rows = exportRows(txs, accounts, categories, '2026-11-01', '2026-11-30')
    expect(rows.map((r) => r.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(rows[0]).toMatchObject({ type: 'Доход', amount: 5000000, account: 'Сбер', category: '' })
    expect(rows[1]).toMatchObject({ type: 'Перевод', amount: 300000, account: 'Сбер', toAccount: 'Наличные' })
    expect(rows[2]).toMatchObject({ type: 'Расход', amount: -123456, category: 'Продукты' })
  })

  it('CSV для русского Excel: ;, запятая в суммах, ДД.ММ.ГГГГ, метка кодировки, кавычки', () => {
    const csv = toCsv(exportRows(txs, accounts, categories, '2026-11-01', '2026-11-30'))
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toBe('Дата;Тип;Сумма, ₽;Счёт;Куда (перевод);Категория;Комментарий')
    expect(lines[1]).toBe("01.11.2026;Доход;50000,00;Сбер;;;'=1+1")
    expect(lines[2]).toBe('02.11.2026;Перевод;3000,00;Сбер;Наличные;;')
    expect(lines[3]).toBe('03.11.2026;Расход;-1234,56;Сбер;;Продукты;"PYATEROCHKA; ""у дома"""')
  })

  it('формулы в тексте обезвреживаются', () => {
    expect(safeText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(safeText('+79990000000')).toBe("'+79990000000")
    expect(safeText('@SUM')).toBe("'@SUM")
    expect(safeText('Пятёрочка')).toBe('Пятёрочка')
  })

  it('Excel: настоящие даты и числа', async () => {
    const XLSX = await import('xlsx')
    const bytes = await toXlsx(exportRows(txs, accounts, categories, '2026-11-01', '2026-11-30'))
    const wb = XLSX.read(bytes, { type: 'array', cellNF: true })
    expect(wb.SheetNames).toEqual(['Операции'])
    const ws = wb.Sheets['Операции']
    expect(ws.A2.t).toBe('n')
    expect(ws.A2.v).toBe(excelSerial('2026-11-01'))
    expect(ws.A2.z).toBe('dd.mm.yyyy')
    expect(ws.C4.v).toBe(-1234.56)
    expect(ws.G2.v).toBe('=1+1') // в Excel это обычный текст, а не формула
    expect(ws.G2.f).toBeUndefined()
  })

  it('дата Excel: 01.03.1900 = 61, 21.11.2026 = 46347', () => {
    expect(excelSerial('1900-03-01')).toBe(61)
    expect(excelSerial('2026-11-21')).toBe(46347)
  })

  it('периоды: месяц, прошлый месяц, год, всё время', () => {
    expect(presetRange('month', '2026-02-10', [])).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(presetRange('prevMonth', '2026-01-15', [])).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('year', '2026-11-21', [])).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(presetRange('all', '2026-11-21', txs)).toEqual({ from: '2026-10-31', to: '2026-11-03' })
    expect(presetRange('all', '2026-11-21', [])).toEqual({ from: '2026-11-21', to: '2026-11-21' })
  })
})

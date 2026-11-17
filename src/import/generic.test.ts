import { describe, expect, it } from 'vitest'
import { decodeText, findHeaderRow, guessMapping, mapTable, parseCsv, parseXlsx, type Table } from './generic'
import { merchantKey, parseBankAmount, parseBankDate } from './normalize'

describe('разбор сумм и дат', () => {
  it('суммы', () => {
    expect(parseBankAmount('1 234,56')).toBe(123456)
    expect(parseBankAmount('+300,00')).toBe(30000)
    expect(parseBankAmount('-1234.5')).toBe(123450)
    expect(parseBankAmount('1 900 ₽')).toBe(190000)
    expect(parseBankAmount('abc')).toBeNull()
  })
  it('даты', () => {
    expect(parseBankDate('17.11.2026')).toBe('2026-11-17')
    expect(parseBankDate('17.11.26 16:29')).toBe('2026-11-17')
    expect(parseBankDate('2026-11-17T10:00:00')).toBe('2026-11-17')
    expect(parseBankDate('31.02.2026')).toBeNull()
    expect(parseBankDate(46343)).toBe('2026-11-17') // дата в Excel — число дней
    expect(parseBankDate('Итого')).toBeNull()
  })
  it('ключ продавца для правил', () => {
    expect(merchantKey('PYATEROCHKA 8813 MOSCOW RUS')).toBe('PYATEROCHKA')
    expect(merchantKey('PYATEROCHKA 19699 MOSCOW RUS')).toBe('PYATEROCHKA')
    expect(merchantKey('YANDEX*5814*EDA MOSCOW RUS')).toBe('YANDEX EDA')
    expect(merchantKey('DIXY-77916D MOSCOW RUS')).toBe('DIXY')
    expect(merchantKey('Перевод в T-Bank')).toBe('ПЕРЕВОД В T BANK')
  })
})

describe('кодировка CSV', () => {
  it('UTF-8 и Windows-1251', () => {
    const utf = new TextEncoder().encode('﻿Дата;Сумма').buffer
    expect(decodeText(utf as ArrayBuffer)).toBe('Дата;Сумма')
    // «Дата» в Windows-1251
    const cp1251 = new Uint8Array([0xc4, 0xe0, 0xf2, 0xe0]).buffer
    expect(decodeText(cp1251)).toBe('Дата')
  })
})

describe('универсальный импорт таблиц', () => {
  it('CSV со знаком суммы: колонки угадываются, подписи и пустые строки пропускаются', async () => {
    const csv = [
      'Выписка по карте',
      '',
      'Дата операции;Дата платежа;Сумма операции;Категория;MCC;Описание',
      '17.11.2026 12:28:00;17.11.2026;-189,98;Супермаркеты;5411;Магазин Колосок',
      '16.11.2026 09:00:00;16.11.2026;+50 000,00;Зарплата;;Работа',
      'Итого;;49 810,02;;;',
    ].join('\n')
    const table = await parseCsv(csv)
    const h = findHeaderRow(table)
    expect(h).toBe(1)
    const map = guessMapping(table[h])
    expect(map).toMatchObject({ date: 0, amount: 2, category: 3, mcc: 4, description: 5 })
    const { rows, skipped } = mapTable(table, h, map as never)
    expect(skipped).toBe(1)
    expect(rows).toEqual([
      { date: '2026-11-17', time: '12:28', amount: 18998, direction: 'out', description: 'Магазин Колосок', bankCategory: 'Супермаркеты', mcc: '5411' },
      { date: '2026-11-16', time: '09:00', amount: 5000000, direction: 'in', description: 'Работа', bankCategory: 'Зарплата' },
    ])
  })

  it('две колонки «Приход» и «Расход»', () => {
    const table: Table = [
      ['Дата', 'Описание', 'Приход', 'Расход'],
      ['01.11.2026', 'Кафе', '', '350,00'],
      ['02.11.2026', 'Возврат', '100,00', ''],
    ]
    const map = guessMapping(table[0])
    expect(map).toMatchObject({ income: 2, expense: 3 })
    expect(mapTable(table, 0, map as never).rows.map((r) => [r.direction, r.amount])).toEqual([
      ['out', 35000],
      ['in', 10000],
    ])
  })

  it('расходы без минуса — переключатель', () => {
    const table: Table = [['Дата', 'Сумма', 'Описание'], ['01.11.2026', '350,00', 'Кафе'], ['02.11.2026', '+100,00', 'Возврат']]
    const { rows } = mapTable(table, 0, { date: 0, amount: 1, description: 2, expensesPositive: true })
    expect(rows.map((r) => r.direction)).toEqual(['out', 'in'])
  })

  it('Excel (.xlsx): числа и даты из ячеек', async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      ['Дата', 'Сумма', 'Описание'],
      [new Date(2026, 10, 17), -1500.5, 'Аптека'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Лист1')
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const table = await parseXlsx(bytes)
    const map = guessMapping(table[0])
    expect(mapTable(table, 0, map as never).rows).toEqual([
      { date: '2026-11-17', amount: 150050, direction: 'out', description: 'Аптека' },
    ])
  })
})

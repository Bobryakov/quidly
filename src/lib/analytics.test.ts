import { describe, expect, it } from 'vitest'
import type { Transaction } from '../db/types'
import {
  changePercent,
  daysInMonth,
  forecast,
  heatmap,
  lastMonthsPeriod,
  monthlyDynamics,
  monthPeriod,
  samePeriodChange,
  spendingByCategory,
} from './analytics'

let n = 0
const tx = (type: Transaction['type'], rub: number, date: string, categoryId?: string): Transaction => ({
  id: String(++n), type, amount: rub * 100, date, accountId: 'a', categoryId, createdAt: n, updatedAt: n,
  ...(type === 'transfer' ? { toAccountId: 'b', categoryId: undefined } : {}),
})

describe('периоды', () => {
  it('месяц и несколько месяцев', () => {
    expect(monthPeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(lastMonthsPeriod('2026-01', 3)).toEqual({ from: '2025-11-01', to: '2026-01-31' })
    expect(daysInMonth('2028-02')).toBe(29)
  })
})

describe('траты по категориям', () => {
  const txs = [
    tx('expense', 3000, '2026-11-02', 'food'),
    tx('expense', 1000, '2026-11-05', 'food'),
    tx('expense', 1000, '2026-11-06', 'cafe'),
    tx('expense', 9999, '2026-10-31', 'food'), // другой месяц
    tx('income', 50000, '2026-11-05', 'salary'),
    tx('transfer', 7000, '2026-11-05'),
  ]
  it('сумма, доля и количество; переводы и доходы не входят', () => {
    const r = spendingByCategory(txs, monthPeriod('2026-11'))
    expect(r.total).toBe(500000)
    expect(r.items).toEqual([
      { categoryId: 'food', amount: 400000, percent: 80, count: 2 },
      { categoryId: 'cafe', amount: 100000, percent: 20, count: 1 },
    ])
  })
  it('пустой период', () => {
    expect(spendingByCategory(txs, monthPeriod('2026-01'))).toEqual({ total: 0, items: [] })
  })
})

describe('динамика по месяцам', () => {
  it('доходы и расходы, месяцы без операций — нули', () => {
    const r = monthlyDynamics(
      [tx('expense', 100, '2026-11-01', 'f'), tx('income', 500, '2026-09-10', 's'), tx('transfer', 50, '2026-11-02')],
      '2026-11',
      3,
    )
    expect(r).toEqual([
      { month: '2026-09', income: 50000, expense: 0 },
      { month: '2026-10', income: 0, expense: 0 },
      { month: '2026-11', income: 0, expense: 10000 },
    ])
  })
  it('текущий месяц сравнивается с теми же днями прошлого', () => {
    const r = samePeriodChange(
      [tx('expense', 300, '2026-11-05', 'f'), tx('expense', 200, '2026-10-03', 'f'), tx('expense', 900, '2026-10-20', 'f')],
      '2026-11-10',
    )
    // 1–10 ноября: 300; 1–10 октября: 200 (20 октября не считается)
    expect(r).toEqual({ now: 30000, before: 20000, days: 10, percent: 50 })
    // 30 марта: в феврале таких дней нет — берём февраль целиком
    const m = samePeriodChange([tx('expense', 100, '2026-02-28', 'f')], '2026-03-30')
    expect(m.before).toBe(10000)
  })

  it('сравнение с прошлым месяцем', () => {
    expect(changePercent(120, 100)).toBe(20)
    expect(changePercent(80, 100)).toBe(-20)
    expect(changePercent(80, 0)).toBeNull()
  })
})

describe('прогноз', () => {
  // ноябрь — 30 дней; сегодня 10-е; потрачено 10 000 → темп 1 000 в день → 30 000 за месяц
  const txs = [tx('expense', 4000, '2026-11-01', 'f'), tx('expense', 6000, '2026-11-10', 'f'), tx('expense', 500, '2026-11-11', 'f')]

  it('«При таком темпе потратишь X ₽»', () => {
    const f = forecast(txs, '2026-11-10', null)
    expect(f).toMatchObject({ spent: 1000000, projected: 3000000, daysPassed: 10, daysTotal: 30, perDay: null })
  })

  it('«Можно тратить Y ₽ в день» — остаток бюджета на оставшиеся дни, считая сегодня', () => {
    // лимит 31 000; осталось 21 000 на 21 день (с 10-го по 30-е) → 1 000 в день
    expect(forecast(txs, '2026-11-10', 3100000).perDay).toBe(100000)
    // бюджет исчерпан — 0, не минус
    expect(forecast(txs, '2026-11-10', 500000).perDay).toBe(0)
  })

  it('округление «в день» вниз до рубля', () => {
    // осталось 10 000 на 21 день = 476,19 → 476
    expect(forecast(txs, '2026-11-10', 2000000).perDay).toBe(47600)
  })
})

describe('календарь-тепловая карта', () => {
  it('неделя с понедельника; 1 ноября 2026 — воскресенье', () => {
    const weeks = heatmap([], '2026-11')
    expect(weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(weeks[0][6]?.date).toBe('2026-11-01')
    expect(weeks.at(-1)!.filter(Boolean).at(-1)?.date).toBe('2026-11-30')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('уровни: 0 — нет трат, 4 — самый дорогой день', () => {
    const weeks = heatmap(
      [tx('expense', 1000, '2026-11-02', 'f'), tx('expense', 250, '2026-11-03', 'f'), tx('expense', 600, '2026-11-04', 'f'), tx('income', 5000, '2026-11-05', 's')],
      '2026-11',
    )
    const cells = weeks.flat().filter(Boolean)
    const level = (d: string) => cells.find((c) => c!.date === d)!.level
    expect(level('2026-11-02')).toBe(4)
    expect(level('2026-11-03')).toBe(1)
    expect(level('2026-11-04')).toBe(3)
    expect(level('2026-11-05')).toBe(0) // доход — не трата
  })
})

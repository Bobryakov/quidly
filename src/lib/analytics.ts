// Расчёты для экрана «Аналитика». Чистые функции, покрыты тестами.
// Везде учитываются только расходы и доходы — переводы между своими счетами не входят.

import type { Transaction } from '../db/types'
import { fromISODate, monthKey, shiftMonth, toISODate } from './dates'
import { weekdayMondayFirst } from './format'

/** Период: даты 'ГГГГ-ММ-ДД' включительно */
export interface Period {
  from: string
  to: string
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function monthPeriod(month: string): Period {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` }
}

/** Последние `n` месяцев, включая месяц `month`. */
export function lastMonthsPeriod(month: string, n: number): Period {
  return { from: monthPeriod(shiftMonth(month, -(n - 1))).from, to: monthPeriod(month).to }
}

export function yearPeriod(year: number): Period {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

const inPeriod = (t: Transaction, p: Period) => t.date >= p.from && t.date <= p.to

export interface CategorySpending {
  categoryId: string
  amount: number
  /** Доля от всех трат периода, % */
  percent: number
  count: number
}

/** Траты по категориям за период — от больших к меньшим. */
export function spendingByCategory(transactions: Transaction[], period: Period): { total: number; items: CategorySpending[] } {
  const map = new Map<string, { amount: number; count: number }>()
  let total = 0
  for (const t of transactions) {
    if (t.type !== 'expense' || !inPeriod(t, period)) continue
    const id = t.categoryId ?? 'none'
    const cur = map.get(id) ?? { amount: 0, count: 0 }
    cur.amount += t.amount
    cur.count++
    map.set(id, cur)
    total += t.amount
  }
  const items = [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, amount: v.amount, count: v.count, percent: total ? (v.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
  return { total, items }
}

export interface MonthTotals {
  month: string
  income: number
  expense: number
}

/** Доходы и расходы по месяцам: `n` месяцев, заканчивая `endMonth`. */
export function monthlyDynamics(transactions: Transaction[], endMonth: string, n = 6): MonthTotals[] {
  const months = Array.from({ length: n }, (_, i) => shiftMonth(endMonth, i - (n - 1)))
  const map = new Map(months.map((m) => [m, { month: m, income: 0, expense: 0 }]))
  for (const t of transactions) {
    const row = map.get(monthKey(t.date))
    if (!row) continue
    if (t.type === 'income') row.income += t.amount
    else if (t.type === 'expense') row.expense += t.amount
  }
  return months.map((m) => map.get(m)!)
}

/** Изменение в процентах: (сейчас − было) / было. null — если сравнивать не с чем. */
export function changePercent(now: number, before: number): number | null {
  if (before === 0) return null
  return ((now - before) / before) * 100
}

export interface Forecast {
  spent: number
  /** «При таком темпе потратишь X ₽ за месяц» */
  projected: number
  daysPassed: number
  daysTotal: number
  /** «Можно тратить Y ₽ в день» — только если есть общий бюджет; 0 — бюджет уже исчерпан */
  perDay: number | null
  daysLeft: number
}

/**
 * Прогноз на текущий месяц. Темп = потрачено с 1-го числа по сегодня включительно.
 * «Можно в день» = (общий лимит − потрачено) / оставшиеся дни, считая сегодня; округляется вниз до рубля.
 */
export function forecast(transactions: Transaction[], today: string, totalLimit: number | null): Forecast {
  const month = monthKey(today)
  const daysTotal = daysInMonth(month)
  const daysPassed = Number(today.slice(8, 10))
  const spent = transactions
    .filter((t) => t.type === 'expense' && t.date >= `${month}-01` && t.date <= today)
    .reduce((s, t) => s + t.amount, 0)
  const projected = Math.round((spent / daysPassed) * daysTotal)
  const daysLeft = daysTotal - daysPassed + 1
  const perDay = totalLimit === null ? null : Math.max(0, Math.floor((totalLimit - spent) / daysLeft / 100) * 100)
  return { spent, projected, daysPassed, daysTotal, perDay, daysLeft }
}

export interface HeatCell {
  date: string
  amount: number
  /** 0 — трат нет, 1…4 — от мало до много */
  level: 0 | 1 | 2 | 3 | 4
}

/** Календарь трат месяца: недели с понедельника, пустые клетки до 1-го и после последнего дня — null. */
export function heatmap(transactions: Transaction[], month: string): (HeatCell | null)[][] {
  const days = daysInMonth(month)
  const sums = new Map<string, number>()
  for (const t of transactions) {
    if (t.type === 'expense' && monthKey(t.date) === month) sums.set(t.date, (sums.get(t.date) ?? 0) + t.amount)
  }
  const max = Math.max(0, ...sums.values())

  const cells: (HeatCell | null)[] = []
  const first = fromISODate(`${month}-01`)
  for (let i = 0; i < weekdayMondayFirst(first); i++) cells.push(null)
  for (let d = 1; d <= days; d++) {
    const date = toISODate(new Date(first.getFullYear(), first.getMonth(), d))
    const amount = sums.get(date) ?? 0
    const level = amount === 0 || max === 0 ? 0 : (Math.min(4, Math.ceil((amount / max) * 4)) as 1 | 2 | 3 | 4)
    cells.push({ date, amount, level })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (HeatCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/**
 * Честное сравнение текущего месяца с прошлым: траты с 1-го по сегодняшнее число
 * против трат прошлого месяца за те же дни (если в прошлом месяце дней меньше — по его последний день).
 */
export function samePeriodChange(transactions: Transaction[], today: string): { now: number; before: number; days: number; percent: number | null } {
  const month = monthKey(today)
  const prev = shiftMonth(month, -1)
  const days = Number(today.slice(8, 10))
  const prevTo = `${prev}-${String(Math.min(days, daysInMonth(prev))).padStart(2, '0')}`
  let now = 0
  let before = 0
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    if (t.date >= `${month}-01` && t.date <= today) now += t.amount
    else if (t.date >= `${prev}-01` && t.date <= prevTo) before += t.amount
  }
  return { now, before, days, percent: changePercent(now, before) }
}

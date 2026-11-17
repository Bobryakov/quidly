// Расчёты бюджета. Только чистые функции — без базы и экрана, всё покрыто тестами.
//
// Словарь:
//   limit     — лимит категории на месяц (как задал человек)
//   carryIn   — перенос с прошлого месяца (+ остаток или − перерасход, если включён перенос перерасхода)
//   available — доступно в этом месяце = limit + carryIn
//   spent     — потрачено (только расходы; переводы не считаются)
//   left      — осталось = available − spent (отрицательное — перерасход)

import type { BudgetRecord, CloseAction, MonthClosing, Transaction } from '../db/types'
import { TOTAL_BUDGET } from '../db/types'
import { monthKey, shiftMonth } from './dates'

export type Level = 'ok' | 'warn' | 'over'

/** Порог «жёлтого» предупреждения */
export const WARN_PERCENT = 80

/** Процент и цвет: зелёный < 80%, жёлтый 80–100%, красный > 100%. */
export function levelOf(spent: number, available: number): { percent: number; level: Level } {
  if (available <= 0) {
    if (spent > 0 || available < 0) return { percent: Infinity, level: 'over' }
    return { percent: 0, level: 'ok' }
  }
  const percent = (spent / available) * 100
  return { percent, level: percent > 100 ? 'over' : percent >= WARN_PERCENT ? 'warn' : 'ok' }
}

/** Лимит, действующий в месяце: последняя запись с fromMonth ≤ month. null — бюджета нет. */
export function limitFor(records: BudgetRecord[], categoryId: string, month: string): number | null {
  let best: BudgetRecord | undefined
  for (const r of records) {
    if (r.categoryId === categoryId && r.fromMonth <= month && (!best || r.fromMonth > best.fromMonth)) best = r
  }
  return best ? best.limit : null
}

/** Первый месяц, когда появился хоть какой-то бюджет. */
export function budgetStartMonth(records: BudgetRecord[]): string | null {
  let start: string | null = null
  for (const r of records) if (r.limit !== null && (start === null || r.fromMonth < start)) start = r.fromMonth
  return start
}

export function expensesByCategory(transactions: Transaction[], month: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of transactions) {
    if (t.type === 'expense' && t.categoryId && monthKey(t.date) === month) {
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
    }
  }
  return map
}

export interface CategoryBudget {
  categoryId: string
  limit: number
  carryIn: number
  available: number
  spent: number
  left: number
  percent: number
  level: Level
}

export interface MonthBudget {
  month: string
  categories: CategoryBudget[]
  total: {
    limit: number
    /** true — общий лимит вписан вручную; false — сумма категорий */
    custom: boolean
    spent: number
    left: number
    percent: number
    level: Level
  }
  /** Есть ли хоть один бюджет в этом месяце */
  active: boolean
}

export interface BudgetContext {
  records: BudgetRecord[]
  transactions: Transaction[]
  /** id расходных категорий в нужном порядке */
  categoryIds: string[]
  closings: Map<string, MonthClosing>
  /** Категории, где перенос остатка выключен */
  rolloverOff: Set<string>
  /** Переносить ли перерасход минусом */
  carryOverspend: boolean
}

/** Бюджет месяца при известном переносе с прошлого месяца. */
export function computeMonthBudget(
  ctx: Pick<BudgetContext, 'records' | 'transactions' | 'categoryIds'>,
  month: string,
  carryIn: Record<string, number>,
): MonthBudget {
  const spentMap = expensesByCategory(ctx.transactions, month)
  const categories: CategoryBudget[] = []
  for (const id of ctx.categoryIds) {
    const limit = limitFor(ctx.records, id, month)
    if (limit === null) continue
    const carry = carryIn[id] ?? 0
    const available = limit + carry
    const spent = spentMap.get(id) ?? 0
    categories.push({ categoryId: id, limit, carryIn: carry, available, spent, left: available - spent, ...levelOf(spent, available) })
  }

  const customTotal = limitFor(ctx.records, TOTAL_BUDGET, month)
  const totalLimit = customTotal ?? categories.reduce((s, c) => s + c.available, 0)
  // В общий бюджет входят все расходы месяца, даже по категориям без своего лимита
  const totalSpent = [...spentMap.values()].reduce((s, v) => s + v, 0)

  return {
    month,
    categories,
    total: {
      limit: totalLimit,
      custom: customTotal !== null,
      spent: totalSpent,
      left: totalLimit - totalSpent,
      ...levelOf(totalSpent, totalLimit),
    },
    active: categories.length > 0 || customTotal !== null,
  }
}

/** Решения по умолчанию: остаток переносится (или обнуляется, если перенос для категории выключен). */
export function defaultActions(mb: MonthBudget, rolloverOff: Set<string>): Record<string, CloseAction> {
  const actions: Record<string, CloseAction> = {}
  for (const c of mb.categories) {
    if (c.left > 0) actions[c.categoryId] = rolloverOff.has(c.categoryId) ? { type: 'reset' } : { type: 'carry' }
  }
  return actions
}

/**
 * Закрытие месяца: сколько каждой категории перейдёт в следующий месяц.
 * 1) «Покрыть перерасход»: остаток категории A гасит минус категории B (не больше, чем нужно).
 *    Что осталось у A после покрытия — переносится (или обнуляется, если перенос у A выключен).
 * 2) «Перенести» — остаток в лимит следующего месяца; «Обнулить» — 0;
 *    «В копилку» — остаток уходит в выбранную копилку (в лимит не переносится).
 * 3) Перерасход переносится минусом только если включена настройка «Переносить перерасход».
 */
export function closeMonth(
  mb: MonthBudget,
  actions: Record<string, CloseAction>,
  opts: { carryOverspend: boolean; rolloverOff: Set<string> },
): Pick<MonthClosing, 'carries' | 'covered' | 'toGoals'> {
  const left = new Map(mb.categories.map((c) => [c.categoryId, c.left]))
  const covered: Record<string, number> = {}

  for (const c of mb.categories) {
    const a = actions[c.categoryId]
    if (a?.type !== 'cover') continue
    const mine = left.get(c.categoryId) ?? 0
    const theirs = left.get(a.to)
    if (mine <= 0 || theirs === undefined || theirs >= 0 || a.to === c.categoryId) continue
    const amount = Math.min(mine, -theirs)
    left.set(c.categoryId, mine - amount)
    left.set(a.to, theirs + amount)
    covered[a.to] = (covered[a.to] ?? 0) + amount
  }

  const carries: Record<string, number> = {}
  const toGoals: Record<string, { goalId: string; amount: number }> = {}
  for (const c of mb.categories) {
    const rest = left.get(c.categoryId) ?? 0
    let carry = 0
    if (rest > 0) {
      const a: CloseAction = actions[c.categoryId] ?? (opts.rolloverOff.has(c.categoryId) ? { type: 'reset' } : { type: 'carry' })
      if (a.type === 'carry') carry = rest
      else if (a.type === 'cover') carry = opts.rolloverOff.has(c.categoryId) ? 0 : rest
      else if (a.type === 'goal') toGoals[c.categoryId] = { goalId: a.goalId, amount: rest }
    } else if (rest < 0 && opts.carryOverspend) {
      carry = rest
    }
    if (carry !== 0) carries[c.categoryId] = carry
  }
  return { carries, covered, toGoals }
}

/**
 * Перенос в месяц `month`: из итогов прошлого месяца, а если он ещё не закрыт —
 * предварительный, по решениям по умолчанию.
 */
export function carryInFor(ctx: BudgetContext, month: string): Record<string, number> {
  const start = budgetStartMonth(ctx.records)
  const prev = shiftMonth(month, -1)
  if (start === null || prev < start) return {}
  const closed = ctx.closings.get(prev)
  if (closed) return closed.carries
  const prevBudget = computeMonthBudget(ctx, prev, carryInFor(ctx, prev))
  return closeMonth(prevBudget, defaultActions(prevBudget, ctx.rolloverOff), ctx).carries
}

/** Бюджет месяца с учётом переносов. */
export function budgetFor(ctx: BudgetContext, month: string): MonthBudget {
  return computeMonthBudget(ctx, month, carryInFor(ctx, month))
}

/** Через сколько дней после начала месяца итоги прошлого месяца применяются сами. */
export const AUTO_CLOSE_DAY = 8

/**
 * Какие месяцы пора закрыть автоматически (по порядку).
 * Прошлый месяц ждёт решения до 7-го числа включительно, более старые закрываются сразу.
 */
export function monthsToAutoClose(ctx: Pick<BudgetContext, 'records' | 'closings'>, today: string): string[] {
  const start = budgetStartMonth(ctx.records)
  if (start === null) return []
  const current = monthKey(today)
  const prev = shiftMonth(current, -1)
  const day = Number(today.slice(8, 10))
  const result: string[] = []
  for (let m = start; m < current; m = shiftMonth(m, 1)) {
    if (ctx.closings.has(m)) continue
    if (m < prev || day >= AUTO_CLOSE_DAY) result.push(m)
  }
  return result
}

/** Месяц, итоги которого ждут решения человека (карточка «Итоги месяца»), или null. */
export function pendingSummaryMonth(ctx: BudgetContext, today: string): string | null {
  const prev = shiftMonth(monthKey(today), -1)
  const start = budgetStartMonth(ctx.records)
  if (start === null || prev < start || ctx.closings.has(prev)) return null
  return budgetFor(ctx, prev).active ? prev : null
}

/** После записи траты: нужно ли предупредить про лимит категории. */
export function budgetWarning(
  before: CategoryBudget | undefined,
  after: CategoryBudget | undefined,
): { level: 'warn' | 'over'; category: CategoryBudget } | null {
  if (!after || after.level === 'ok') return null
  if (before && before.level === after.level) return null // уже было в этом состоянии — не надоедаем
  return { level: after.level, category: after }
}

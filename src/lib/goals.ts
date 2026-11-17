// Расчёты копилок. Чистые функции, покрыты тестами.

import type { Goal, GoalMove } from '../db/types'
import { daysBetween } from './subscriptions'

/** Сколько лежит в каждой копилке. */
export function goalBalances(moves: GoalMove[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of moves) map.set(m.goalId, (map.get(m.goalId) ?? 0) + m.amount)
  return map
}

/** Всего отложено во всех копилках. */
export function totalSaved(goals: Goal[], balances: Map<string, number>): number {
  return goals.reduce((s, g) => s + Math.max(0, balances.get(g.id) ?? 0), 0)
}

export function goalPercent(balance: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, (balance / target) * 100))
}

/** Сколько календарных месяцев осталось, считая текущий и месяц срока (ноябрь → декабрь = 2). */
export function monthsLeft(today: string, deadline: string): number {
  const [ty, tm] = today.split('-').map(Number)
  const [dy, dm] = deadline.split('-').map(Number)
  return dy * 12 + dm - (ty * 12 + tm) + 1
}

export type GoalPlan =
  | { kind: 'done' }
  | { kind: 'no-deadline'; remaining: number }
  | { kind: 'overdue'; remaining: number }
  | { kind: 'monthly'; remaining: number; perMonth: number; months: number; daysLeft: number }

/**
 * Подсказка «Чтобы успеть к сроку, откладывай X ₽ в месяц».
 * Сумма в месяц округляется вверх до рубля.
 */
export function goalPlan(goal: Goal, balance: number, today: string): GoalPlan {
  const remaining = goal.target - balance
  if (remaining <= 0) return { kind: 'done' }
  if (!goal.deadline) return { kind: 'no-deadline', remaining }
  if (goal.deadline < today) return { kind: 'overdue', remaining }
  const months = Math.max(1, monthsLeft(today, goal.deadline))
  const perMonth = Math.ceil(remaining / months / 100) * 100
  return { kind: 'monthly', remaining, perMonth, months, daysLeft: daysBetween(today, goal.deadline) }
}

/** Цель только что достигнута этим движением? (для конфетти) */
export function justAchieved(before: number, after: number, target: number): boolean {
  return before < target && after >= target
}

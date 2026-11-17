import type { Category, Transaction } from '../db/types'
import { addDays } from './dates'

/**
 * Порядок категорий в быстром вводе: сначала частые и недавние.
 * Оценка: число операций за последние 60 дней; при равенстве — та, что использовалась позже;
 * неиспользованные — в исходном порядке.
 */
export function orderCategoriesByUsage(
  categories: Category[],
  transactions: Transaction[],
  today: string,
): Category[] {
  const since = addDays(today, -60)
  const count = new Map<string, number>()
  const last = new Map<string, number>()

  for (const t of transactions) {
    if (!t.categoryId) continue
    const used = t.createdAt
    if ((last.get(t.categoryId) ?? 0) < used) last.set(t.categoryId, used)
    if (t.date >= since) count.set(t.categoryId, (count.get(t.categoryId) ?? 0) + 1)
  }

  return [...categories].sort((a, b) => {
    const byCount = (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0)
    if (byCount !== 0) return byCount
    const byLast = (last.get(b.id) ?? 0) - (last.get(a.id) ?? 0)
    if (byLast !== 0) return byLast
    return a.order - b.order
  })
}

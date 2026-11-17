import { budgetFor, budgetWarning } from '../lib/budget'
import { monthKey } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { db } from './db'
import { loadBudgetContext } from './repo'

/**
 * Выполняет действие с тратой и сообщает, перешёл ли бюджет категории порог 80% или 100%.
 * Возвращает текст предупреждения для плашки или null.
 */
export async function withBudgetWarning<T>(
  categoryId: string | undefined,
  date: string,
  action: () => Promise<T>,
): Promise<{ result: T; warning: string | null }> {
  const month = monthKey(date)
  const stateOf = async () =>
    categoryId ? budgetFor(await loadBudgetContext(), month).categories.find((c) => c.categoryId === categoryId) : undefined

  const before = await stateOf()
  const result = await action()
  const w = budgetWarning(before, await stateOf())
  if (!w) return { result, warning: null }

  const name = (await db.categories.get(w.category.categoryId))?.name ?? 'Категория'
  const warning =
    w.level === 'over'
      ? `🔴 ${name}: лимит превышен на ${formatMoney(-w.category.left, { hideZeroKopecks: true })}`
      : `🟡 ${name}: потрачено ${Math.round(w.category.percent)}% лимита`
  return { result, warning }
}

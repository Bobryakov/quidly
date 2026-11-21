import type { Category, CategoryKind } from './types'

// Стартовый набор категорий из SPEC (раздел 3).
// ВАЖНО: id категорий — по номеру в списке (seed-expense-1…12). Новые категории добавляются
// в конец (13, 14…), чтобы id старых не сдвинулись; место в списке задаёт ORDER ниже.
const EXPENSE: [string, string, string][] = [
  ['🛒', 'Продукты', '#22c55e'],
  ['☕', 'Кафе', '#f97316'],
  ['🚌', 'Транспорт', '#3b82f6'],
  ['🏠', 'Дом', '#a855f7'],
  ['💊', 'Здоровье', '#ef4444'],
  ['📺', 'Подписки', '#6366f1'],
  ['🎉', 'Развлечения', '#ec4899'],
  ['👕', 'Одежда', '#14b8a6'],
  ['🎁', 'Подарки', '#f43f5e'],
  ['📱', 'Связь', '#0ea5e9'],
  ['📚', 'Образование', '#eab308'],
  ['💸', 'Прочее', '#64748b'],
  // этап 9 (схема v6)
  ['🏦', 'Кредиты', '#92400e'],
  ['🧾', 'ЖКХ', '#4d7c0f'],
]

/** Порядок расходных категорий: «Кредиты» и «ЖКХ» — перед «Прочее» (номера — из списка выше). */
const EXPENSE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 12]

/** Категории, добавленные после первого выпуска: в какой версии базы появились. */
export const ADDED_CATEGORIES: { version: number; ids: string[] } = { version: 6, ids: ['seed-expense-13', 'seed-expense-14'] }

const INCOME: [string, string, string][] = [
  ['💰', 'Зарплата', '#16a34a'],
  ['🎁', 'Подарки (доход)', '#db2777'],
  ['📈', 'Проценты', '#0891b2'],
  ['💵', 'Прочие доходы', '#65a30d'],
]

function build(list: [string, string, string][], kind: CategoryKind, now: number, order?: number[]): Category[] {
  return list.map(([emoji, name, color], i) => ({
    id: `seed-${kind}-${i + 1}`,
    name,
    kind,
    emoji,
    color,
    order: order ? order.indexOf(i + 1) : i,
    createdAt: now,
  }))
}

export function defaultCategories(now = Date.now()): Category[] {
  return [...build(EXPENSE, 'expense', now, EXPENSE_ORDER), ...build(INCOME, 'income', now)]
}

/**
 * Список категорий + стартовые категории, добавленные в новых версиях («Кредиты», «ЖКХ»),
 * если их ещё нет (по id или по такому же названию). Новые встают перед «Прочее».
 * Используется и миграцией базы, и при восстановлении старой резервной копии.
 */
export function withNewSeedCategories(all: Category[], now = Date.now()): Category[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  const toAdd = defaultCategories(now)
    .filter((d) => ADDED_CATEGORIES.ids.includes(d.id))
    .filter((d) => !all.some((c) => c.id === d.id || (c.kind === d.kind && same(c.name, d.name))))
  if (toAdd.length === 0) return all
  const expenses = all.filter((c) => c.kind === 'expense')
  const other = expenses.find((c) => c.id === 'seed-expense-12')
  const insertAt = other ? other.order : Math.max(-1, ...expenses.map((c) => c.order)) + 1
  const shifted = all.map((c) => (c.kind === 'expense' && c.order >= insertAt ? { ...c, order: c.order + toAdd.length } : c))
  return [...shifted, ...toAdd.map((c, i) => ({ ...c, order: insertAt + i }))]
}

/** Палитра для выбора цвета счёта или категории */
export const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#64748b',
]

/** Подборка эмодзи для выбора (можно вписать и свою) */
export const EMOJIS = [
  '🛒', '☕', '🍔', '🍕', '🚌', '🚕', '⛽', '🚗', '🏠', '💡', '🛠️', '🧹',
  '💊', '🦷', '💪', '📺', '🎮', '🎬', '🎉', '🍻', '👕', '👟', '💄', '💇',
  '🎁', '📱', '💻', '📚', '🎓', '👶', '🐶', '✈️', '🏖️', '🏦', '💳', '💵',
  '💰', '📈', '🐷', '🎯', '❤️', '⭐', '💸', '🧾',
]

export const ACCOUNT_TYPES = {
  card: { label: 'Карта', emoji: '💳' },
  cash: { label: 'Наличные', emoji: '💵' },
  deposit: { label: 'Вклад', emoji: '🏦' },
} as const

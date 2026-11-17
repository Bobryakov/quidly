import type { Category, CategoryKind } from './types'

// Стартовый набор категорий из SPEC (раздел 3)
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
]

const INCOME: [string, string, string][] = [
  ['💰', 'Зарплата', '#16a34a'],
  ['🎁', 'Подарки (доход)', '#db2777'],
  ['📈', 'Проценты', '#0891b2'],
  ['💵', 'Прочие доходы', '#65a30d'],
]

function build(list: [string, string, string][], kind: CategoryKind, now: number): Category[] {
  return list.map(([emoji, name, color], i) => ({
    id: `seed-${kind}-${i + 1}`,
    name,
    kind,
    emoji,
    color,
    order: i,
    createdAt: now,
  }))
}

export function defaultCategories(now = Date.now()): Category[] {
  return [...build(EXPENSE, 'expense', now), ...build(INCOME, 'income', now)]
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

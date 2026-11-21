// Автокатегории при импорте. Порядок: правило пользователя → категория банка → MCC-код → «Прочее».

import type { Category, CategoryKind, ImportRule } from '../db/types'
import { merchantKey } from './normalize'
import type { ParsedRow } from './types'

/** Категория банка → название нашей стартовой категории */
const BANK_CATEGORIES: [RegExp, string][] = [
  [/супермаркет|продукт|продовольств/i, 'Продукты'],
  [/ресторан|кафе|фастфуд|фаст-фуд|бар/i, 'Кафе'],
  [/транспорт|такси|каршеринг|топливо|азс|авиабилет|ж\/д/i, 'Транспорт'],
  [/жкх|коммунал/i, 'ЖКХ'],
  // если категорию «ЖКХ» удалили — коммуналка идёт в «Дом»
  [/для дома|дом и ремонт|ремонт|жкх|коммунал/i, 'Дом'],
  [/здоровье|аптек|медицин|красот/i, 'Здоровье'],
  [/развлечен|отдых|кино|театр|спорт/i, 'Развлечения'],
  [/одежда|обувь/i, 'Одежда'],
  [/подарк|цвет/i, 'Подарки'],
  [/связь|телеком|интернет/i, 'Связь'],
  [/образован|книг/i, 'Образование'],
  [/подписк|цифров/i, 'Подписки'],
  [/зарплат|заработн/i, 'Зарплата'],
  [/процент|капитализ/i, 'Проценты'],
]

/** MCC-код → название нашей категории (самые частые коды) */
const MCC: [number[], string][] = [
  [[5411, 5412, 5422, 5441, 5451, 5462, 5499], 'Продукты'],
  [[5812, 5813, 5814], 'Кафе'],
  [[4111, 4112, 4121, 4131, 4784, 4789, 5541, 5542, 7512, 7523], 'Транспорт'],
  [[5912, 8011, 8021, 8042, 8062, 8071, 8099, 7230, 7298], 'Здоровье'],
  [[5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699], 'Одежда'],
  [[4812, 4814, 4816, 4899], 'Связь'],
  [[7832, 7841, 7922, 7929, 7991, 7996, 7997, 7999], 'Развлечения'],
  [[5942, 8211, 8220, 8241, 8244, 8249, 8299], 'Образование'],
  [[4900], 'ЖКХ'],
  [[4900, 5200, 5211, 5231, 5251, 5712, 5719, 5722], 'Дом'],
  [[5947, 5992], 'Подарки'],
  [[5815, 5816, 5817, 5818], 'Подписки'],
]

export type CategorySource = 'rule' | 'bank' | 'mcc' | 'default'

/** Подходит ли правило к описанию: ключ продавца совпадает или содержит шаблон. */
export function ruleMatches(rule: ImportRule, description: string): boolean {
  const key = merchantKey(description)
  return key.length > 0 && (key === rule.pattern || (rule.pattern.length >= 3 && key.includes(rule.pattern)))
}

export function categorize(
  row: ParsedRow,
  kind: CategoryKind,
  categories: Category[],
  rules: ImportRule[],
): { categoryId: string; source: CategorySource } {
  const ofKind = categories.filter((c) => c.kind === kind)
  const byName = (name: string) => ofKind.find((c) => c.name.toLowerCase() === name.toLowerCase())

  const rule = rules.find((r) => ruleMatches(r, row.description) && ofKind.some((c) => c.id === r.categoryId))
  if (rule) return { categoryId: rule.categoryId, source: 'rule' }

  if (row.bankCategory) {
    for (const [re, name] of BANK_CATEGORIES) {
      const c = re.test(row.bankCategory) ? byName(name) : undefined
      if (c) return { categoryId: c.id, source: 'bank' }
    }
  }

  if (row.mcc) {
    const code = Number(row.mcc)
    for (const [codes, name] of MCC) {
      const c = codes.includes(code) ? byName(name) : undefined
      if (c) return { categoryId: c.id, source: 'mcc' }
    }
  }

  const fallback = byName(kind === 'expense' ? 'Прочее' : 'Прочие доходы') ?? ofKind[ofKind.length - 1]
  return { categoryId: fallback.id, source: 'default' }
}

import Dexie, { type EntityTable, type Table } from 'dexie'
import { defaultCategories, withNewSeedCategories } from './seed'
import type {
  Account,
  BudgetRecord,
  Category,
  Goal,
  GoalMove,
  ImportRule,
  MetaRecord,
  MonthClosing,
  Subscription,
  Transaction,
} from './types'

/**
 * База данных Quidly в браузере (IndexedDB через Dexie).
 *
 * ВАЖНО: схема версионируется. Нельзя менять уже выпущенную версию —
 * только добавлять новую `this.version(N + 1)` с миграцией (.upgrade),
 * иначе у пользователя потеряются данные.
 */
export class QuidlyDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>
  budgets!: EntityTable<BudgetRecord, 'id'>
  closings!: EntityTable<MonthClosing, 'month'>
  subscriptions!: EntityTable<Subscription, 'id'>
  goals!: EntityTable<Goal, 'id'>
  goalMoves!: EntityTable<GoalMove, 'id'>
  importRules!: EntityTable<ImportRule, 'id'>

  constructor(name = 'quidly') {
    super(name)

    // Версия 1 — этап 2: счета, категории, операции, служебные настройки
    this.version(1).stores({
      accounts: 'id, order, archived',
      categories: 'id, kind, order',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt',
      meta: 'key',
    })

    // Версия 2 — этап 3: бюджеты и итоги месяцев. Старые таблицы не меняются,
    // поэтому миграция данных не нужна — добавляются только новые таблицы.
    this.version(2).stores({
      budgets: 'id, categoryId, fromMonth',
      closings: 'month',
    })

    // Версия 3 — этап 4: подписки. Новая таблица + у операций появляется индекс по подписке
    // (поле необязательное, старые операции не меняются).
    this.version(3).stores({
      subscriptions: 'id, nextDate, categoryId, accountId',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt, subscriptionId',
    })

    // Версия 4 — этап 5: копилки и движения по ним (новые таблицы, старые не меняются)
    this.version(4).stores({
      goals: 'id, createdAt',
      goalMoves: 'id, goalId, date',
    })

    // Версия 5 — этап 7: импорт выписок. Правила автокатегорий + у операций индекс метки импорта
    // (поле необязательное, старые операции не меняются).
    this.version(5).stores({
      importRules: 'id, pattern, categoryId',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt, subscriptionId, importKey',
    })

    // Версия 6 — этап 9: новые стартовые категории «Кредиты» и «ЖКХ».
    // Таблицы не меняются; у тех, кто уже пользуется приложением, категории добавляются
    // перед «Прочее» — если человек не завёл такие сам (сравниваем по названию).
    this.version(6)
      .stores({})
      .upgrade((tx) => addMissingSeedCategories(tx.table('categories')))

    // Стартовые категории кладутся один раз — при самом первом создании базы
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(defaultCategories())
    })
  }
}

/** Добавить новые стартовые категории (миграция v6). Повторный вызов ничего не задваивает. */
export async function addMissingSeedCategories(categories: Table<Category, string>): Promise<number> {
  const all = await categories.toArray()
  const next = withNewSeedCategories(all)
  if (next.length === all.length) return 0
  await categories.bulkPut(next)
  return next.length - all.length
}

export const db = new QuidlyDB()

/** Текущая версия схемы — записывается в резервные копии (этап 8). */
export const SCHEMA_VERSION = 6

/**
 * Просим браузер не удалять наши данные при нехватке места.
 * Браузер может отказать — это не ошибка, просто данные остаются «обычными».
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    // не поддерживается — ничего страшного
  }
}

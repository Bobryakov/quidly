import Dexie, { type EntityTable } from 'dexie'
import { defaultCategories } from './seed'
import type { Account, Category, MetaRecord, Transaction } from './types'

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

  constructor(name = 'quidly') {
    super(name)

    // Версия 1 — этап 2: счета, категории, операции, служебные настройки
    this.version(1).stores({
      accounts: 'id, order, archived',
      categories: 'id, kind, order',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt',
      meta: 'key',
    })

    // Стартовые категории кладутся один раз — при самом первом создании базы
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(defaultCategories())
    })
  }
}

export const db = new QuidlyDB()

/** Текущая версия схемы — пригодится для бэкапов (этап 8). */
export const SCHEMA_VERSION = 1

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

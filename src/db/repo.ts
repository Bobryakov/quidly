import { db } from './db'
import type { Account, AccountType, Category, CategoryKind, Transaction, TransactionType } from './types'

// Все изменения данных идут через эти функции — так проверки в одном месте.

export function newId(): string {
  return crypto.randomUUID()
}

// ---------- служебные настройки ----------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export const META = {
  lastAccountId: 'lastAccountId',
} as const

// ---------- счета ----------

export type AccountInput = {
  name: string
  type: AccountType
  emoji: string
  color: string
  initialBalance: number
}

function checkAccount(a: AccountInput) {
  if (!a.name.trim()) throw new Error('Название счёта не может быть пустым')
  if (!Number.isInteger(a.initialBalance)) throw new Error('Остаток должен быть в копейках')
}

export async function createAccount(input: AccountInput): Promise<string> {
  checkAccount(input)
  const id = newId()
  const order = await db.accounts.count()
  await db.accounts.add({
    ...input,
    name: input.name.trim(),
    id,
    archived: false,
    order,
    createdAt: Date.now(),
  })
  return id
}

export async function updateAccount(id: string, patch: Partial<AccountInput & { archived: boolean }>) {
  const current = await db.accounts.get(id)
  if (!current) throw new Error('Счёт не найден')
  const next = { ...current, ...patch }
  checkAccount(next)
  await db.accounts.put({ ...next, name: next.name.trim() })
}

export async function accountUsageCount(id: string): Promise<number> {
  const [a, b] = await Promise.all([
    db.transactions.where('accountId').equals(id).count(),
    db.transactions.where('toAccountId').equals(id).count(),
  ])
  return a + b
}

/** Удалить можно только счёт без операций. Счёт с операциями — архивировать. */
export async function deleteAccount(id: string): Promise<void> {
  if ((await accountUsageCount(id)) > 0) {
    throw new Error('У счёта есть операции — его можно только убрать в архив')
  }
  await db.accounts.delete(id)
}

/** Первый запуск: создаём счета, которые человек заполнил на экране знакомства. */
export async function finishOnboarding(accounts: AccountInput[]): Promise<void> {
  if (accounts.length === 0) throw new Error('Нужен хотя бы один счёт')
  accounts.forEach(checkAccount)
  const now = Date.now()
  await db.transaction('rw', db.accounts, db.meta, async () => {
    const records: Account[] = accounts.map((a, i) => ({
      ...a,
      name: a.name.trim(),
      id: newId(),
      archived: false,
      order: i,
      createdAt: now,
    }))
    await db.accounts.bulkAdd(records)
    await db.meta.put({ key: META.lastAccountId, value: records[0].id })
  })
}

// ---------- операции ----------

export type TransactionInput = {
  type: TransactionType
  amount: number
  date: string
  accountId: string
  toAccountId?: string
  categoryId?: string
  comment?: string
}

async function checkTransaction(t: TransactionInput): Promise<void> {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('Введите сумму больше нуля')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) throw new Error('Неверная дата')
  if (!(await db.accounts.get(t.accountId))) throw new Error('Счёт не найден')

  if (t.type === 'transfer') {
    if (!t.toAccountId || !(await db.accounts.get(t.toAccountId))) throw new Error('Выберите счёт, куда переводить')
    if (t.toAccountId === t.accountId) throw new Error('Перевод на тот же самый счёт не имеет смысла')
    if (t.categoryId) throw new Error('У перевода не бывает категории')
  } else {
    const cat = t.categoryId ? await db.categories.get(t.categoryId) : undefined
    if (!cat) throw new Error('Выберите категорию')
    if (cat.kind !== t.type) throw new Error('Категория не подходит к типу операции')
    if (t.toAccountId) throw new Error('Счёт «куда» бывает только у перевода')
  }
}

function clean(t: TransactionInput): TransactionInput {
  const comment = t.comment?.trim()
  return {
    type: t.type,
    amount: t.amount,
    date: t.date,
    accountId: t.accountId,
    ...(t.type === 'transfer' ? { toAccountId: t.toAccountId } : { categoryId: t.categoryId }),
    ...(comment ? { comment } : {}),
  }
}

export async function addTransaction(input: TransactionInput): Promise<string> {
  const t = clean(input)
  await checkTransaction(t)
  const id = newId()
  const now = Date.now()
  await db.transaction('rw', db.transactions, db.meta, async () => {
    await db.transactions.add({ ...t, id, createdAt: now, updatedAt: now })
    await db.meta.put({ key: META.lastAccountId, value: t.accountId })
  })
  return id
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const current = await db.transactions.get(id)
  if (!current) throw new Error('Операция не найдена')
  const t = clean(input)
  await checkTransaction(t)
  await db.transactions.put({ ...t, id, createdAt: current.createdAt, updatedAt: Date.now() })
}

/** Удаляет операцию и возвращает её — чтобы можно было «Отменить». */
export async function deleteTransaction(id: string): Promise<Transaction | undefined> {
  const t = await db.transactions.get(id)
  if (t) await db.transactions.delete(id)
  return t
}

export async function restoreTransaction(t: Transaction): Promise<void> {
  await db.transactions.put(t)
}

// ---------- категории ----------

export type CategoryInput = { name: string; kind: CategoryKind; emoji: string; color: string }

export async function createCategory(input: CategoryInput): Promise<string> {
  if (!input.name.trim()) throw new Error('Название категории не может быть пустым')
  const id = newId()
  const order = await db.categories.where('kind').equals(input.kind).count()
  await db.categories.add({ ...input, name: input.name.trim(), id, order, createdAt: Date.now() })
  return id
}

/** Переименовать, сменить эмодзи или цвет. Тип (расход/доход) не меняется. */
export async function updateCategory(id: string, patch: Partial<Omit<CategoryInput, 'kind'>>) {
  const current = await db.categories.get(id)
  if (!current) throw new Error('Категория не найдена')
  const next: Category = { ...current, ...patch }
  if (!next.name.trim()) throw new Error('Название категории не может быть пустым')
  await db.categories.put({ ...next, name: next.name.trim() })
}

export async function categoryUsageCount(id: string): Promise<number> {
  return db.transactions.where('categoryId').equals(id).count()
}

/**
 * Объединение: все операции категории `fromId` переходят в `toId`, а `fromId` удаляется.
 * Позже (бюджеты, подписки, правила импорта) сюда добавится перенос и для них.
 */
export async function mergeCategories(fromId: string, toId: string): Promise<number> {
  if (fromId === toId) throw new Error('Нельзя объединить категорию саму с собой')
  return db.transaction('rw', db.categories, db.transactions, async () => {
    const [from, to] = await Promise.all([db.categories.get(fromId), db.categories.get(toId)])
    if (!from || !to) throw new Error('Категория не найдена')
    if (from.kind !== to.kind) throw new Error('Объединять можно только расходы с расходами, доходы с доходами')
    const moved = await db.transactions
      .where('categoryId')
      .equals(fromId)
      .modify({ categoryId: toId, updatedAt: Date.now() })
    await db.categories.delete(fromId)
    return moved
  })
}

/** Удалить можно только пустую категорию; с операциями — через объединение. */
export async function deleteCategory(id: string): Promise<void> {
  if ((await categoryUsageCount(id)) > 0) {
    throw new Error('В категории есть операции — сначала перенесите их в другую категорию')
  }
  const cat = await db.categories.get(id)
  if (cat && (await db.categories.where('kind').equals(cat.kind).count()) <= 1) {
    throw new Error('Должна остаться хотя бы одна категория')
  }
  await db.categories.delete(id)
}

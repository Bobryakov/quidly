import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/resetDb'
import { db } from './db'
import {
  addTransaction,
  createAccount,
  createCategory,
  deleteAccount,
  deleteCategory,
  deleteTransaction,
  finishOnboarding,
  getMeta,
  META,
  mergeCategories,
  restoreTransaction,
  updateTransaction,
} from './repo'

beforeEach(resetDb)

const card = { name: 'Карта', type: 'card' as const, emoji: '💳', color: '#3b82f6', initialBalance: 100000 }
const cash = { name: 'Наличные', type: 'cash' as const, emoji: '💵', color: '#22c55e', initialBalance: 0 }

describe('база данных', () => {
  it('при первом запуске есть стартовые категории: 12 расходов и 4 дохода', async () => {
    expect(await db.categories.where('kind').equals('expense').count()).toBe(12)
    expect(await db.categories.where('kind').equals('income').count()).toBe(4)
    expect(await db.accounts.count()).toBe(0)
  })

  it('знакомство создаёт счета и запоминает первый как последний использованный', async () => {
    await finishOnboarding([card, cash])
    const accounts = await db.accounts.orderBy('order').toArray()
    expect(accounts.map((a) => a.name)).toEqual(['Карта', 'Наличные'])
    expect(await getMeta(META.lastAccountId)).toBe(accounts[0].id)
  })

  it('операция запоминает счёт как последний использованный', async () => {
    const cardId = await createAccount(card)
    const cashId = await createAccount(cash)
    await addTransaction({ type: 'expense', amount: 500, date: '2026-11-17', accountId: cashId, categoryId: 'seed-expense-1' })
    expect(await getMeta(META.lastAccountId)).toBe(cashId)
    expect(cardId).not.toBe(cashId)
  })

  it('проверки при сохранении операции', async () => {
    const a = await createAccount(card)
    const b = await createAccount(cash)
    const base = { date: '2026-11-17', accountId: a }
    await expect(addTransaction({ ...base, type: 'expense', amount: 0, categoryId: 'seed-expense-1' })).rejects.toThrow('сумму')
    await expect(addTransaction({ ...base, type: 'expense', amount: 100 })).rejects.toThrow('категорию')
    await expect(addTransaction({ ...base, type: 'expense', amount: 100, categoryId: 'seed-income-1' })).rejects.toThrow('не подходит')
    await expect(addTransaction({ ...base, type: 'transfer', amount: 100, toAccountId: a })).rejects.toThrow('тот же')
    await expect(addTransaction({ ...base, type: 'transfer', amount: 100, toAccountId: b })).resolves.toBeTruthy()
  })

  it('при правке тип можно сменить: лишние поля убираются', async () => {
    const a = await createAccount(card)
    const b = await createAccount(cash)
    const id = await addTransaction({ type: 'expense', amount: 100, date: '2026-11-17', accountId: a, categoryId: 'seed-expense-1', comment: '  хлеб ' })
    expect((await db.transactions.get(id))?.comment).toBe('хлеб')
    await updateTransaction(id, { type: 'transfer', amount: 100, date: '2026-11-17', accountId: a, toAccountId: b, categoryId: 'seed-expense-1' })
    const t = await db.transactions.get(id)
    expect(t?.type).toBe('transfer')
    expect(t?.categoryId).toBeUndefined()
    expect(t?.toAccountId).toBe(b)
  })

  it('удаление операции можно отменить', async () => {
    const a = await createAccount(card)
    const id = await addTransaction({ type: 'expense', amount: 100, date: '2026-11-17', accountId: a, categoryId: 'seed-expense-1' })
    const removed = await deleteTransaction(id)
    expect(await db.transactions.count()).toBe(0)
    await restoreTransaction(removed!)
    expect(await db.transactions.get(id)).toEqual(removed)
  })

  it('объединение категорий переносит операции и удаляет исходную', async () => {
    const a = await createAccount(card)
    const coffee = await createCategory({ name: 'Кофе', kind: 'expense', emoji: '☕', color: '#000' })
    await addTransaction({ type: 'expense', amount: 100, date: '2026-11-17', accountId: a, categoryId: coffee })
    await addTransaction({ type: 'expense', amount: 200, date: '2026-11-17', accountId: a, categoryId: coffee })
    const moved = await mergeCategories(coffee, 'seed-expense-2')
    expect(moved).toBe(2)
    expect(await db.categories.get(coffee)).toBeUndefined()
    expect(await db.transactions.where('categoryId').equals('seed-expense-2').count()).toBe(2)
  })

  it('нельзя объединить расход с доходом', async () => {
    await expect(mergeCategories('seed-expense-1', 'seed-income-1')).rejects.toThrow()
  })

  it('категорию с операциями нельзя просто удалить', async () => {
    const a = await createAccount(card)
    await addTransaction({ type: 'expense', amount: 100, date: '2026-11-17', accountId: a, categoryId: 'seed-expense-1' })
    await expect(deleteCategory('seed-expense-1')).rejects.toThrow('перенесите')
    await deleteCategory('seed-expense-3')
    expect(await db.categories.get('seed-expense-3')).toBeUndefined()
  })

  it('счёт с операциями нельзя удалить, только в архив', async () => {
    const a = await createAccount(card)
    const b = await createAccount(cash)
    await addTransaction({ type: 'transfer', amount: 100, date: '2026-11-17', accountId: a, toAccountId: b })
    await expect(deleteAccount(b)).rejects.toThrow('архив')
    const c = await createAccount({ ...cash, name: 'Пустой' })
    await deleteAccount(c)
    expect(await db.accounts.get(c)).toBeUndefined()
  })
})

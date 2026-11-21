import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/resetDb'
import { db, QuidlyDB } from './db'
import { defaultCategories } from './seed'
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
  it('при первом запуске есть стартовые категории: 14 расходов и 4 дохода', async () => {
    expect(await db.categories.where('kind').equals('expense').count()).toBe(14)
    // «Кредиты» и «ЖКХ» — перед «Прочее», «Прочее» — последняя
    const names = (await db.categories.where('kind').equals('expense').sortBy('order')).map((c) => c.name)
    expect(names.slice(-3)).toEqual(['Кредиты', 'ЖКХ', 'Прочее'])
    expect(new Set((await db.categories.toArray()).map((c) => c.order)).size).toBeGreaterThan(13)
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

describe('обновление базы до версии 6: категории «Кредиты» и «ЖКХ»', () => {
  it('добавляются перед «Прочее», порядок остальных сохраняется; своя «ЖКХ» не задваивается', async () => {
    const name = 'quidly-v5-cats'
    await Dexie.delete(name)
    const v5 = new Dexie(name)
    v5.version(5).stores({
      accounts: 'id, order, archived',
      categories: 'id, kind, order',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt, subscriptionId, importKey',
      meta: 'key',
      budgets: 'id, categoryId, fromMonth',
      closings: 'month',
      subscriptions: 'id, nextDate, categoryId, accountId',
      goals: 'id, createdAt',
      goalMoves: 'id, goalId, date',
      importRules: 'id, pattern, categoryId',
    })
    await v5.open()
    const old = defaultCategories(1).filter((c) => !['seed-expense-13', 'seed-expense-14'].includes(c.id))
    // как было в версии 5: «Прочее» — последняя (order 11), плюс своя категория «ЖКХ» после неё
    await v5.table('categories').bulkAdd(old.map((c) => (c.kind === 'expense' ? { ...c, order: Number(c.id.split('-')[2]) - 1 } : c)))
    await v5.table('categories').add({ id: 'mine', name: 'Жкх', kind: 'expense', emoji: '💡', color: '#000', order: 12, createdAt: 2 })
    v5.close()

    const v6 = new QuidlyDB(name)
    await v6.open()
    expect(v6.verno).toBe(6)
    const exp = await v6.categories.where('kind').equals('expense').sortBy('order')
    expect(exp.map((c) => c.name)).toEqual([
      'Продукты', 'Кафе', 'Транспорт', 'Дом', 'Здоровье', 'Подписки', 'Развлечения', 'Одежда', 'Подарки', 'Связь', 'Образование',
      'Кредиты', 'Прочее', 'Жкх',
    ])
    expect(await v6.categories.get('seed-expense-14')).toBeUndefined()
    // повторное открытие ничего не добавляет
    v6.close()
    const again = new QuidlyDB(name)
    await again.open()
    expect(await again.categories.count()).toBe(18)
    again.close()
    await Dexie.delete(name)
  })
})

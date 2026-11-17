import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/resetDb'
import { withBudgetWarning } from './budgetWatch'
import { db, QuidlyDB } from './db'
import {
  createAccount,
  createCategory,
  createSubscription,
  deleteAccount,
  deleteCategory,
  markSubscriptionPaid,
  mergeCategories,
  setBudget,
  skipSubscriptionCharge,
  undoSubscriptionCharge,
  updateSubscription,
} from './repo'

beforeEach(resetDb)

const SUBS_CAT = 'seed-expense-6' // 📺 Подписки

async function setup(nextDate = '2026-11-20') {
  const accountId = await createAccount({ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 0 })
  const id = await createSubscription({
    name: 'Кино', amount: 79900, period: 'month', nextDate, accountId, categoryId: SUBS_CAT,
  })
  return { accountId, id }
}

describe('подписки в базе', () => {
  it('создание запоминает «число месяца»', async () => {
    const { id } = await setup('2026-11-30')
    expect(await db.subscriptions.get(id)).toMatchObject({ anchorDay: 30, paused: false, name: 'Кино' })
  })

  it('проверки: сумма, название, категория расходов', async () => {
    const { accountId } = await setup()
    const base = { name: 'X', amount: 100, period: 'month' as const, nextDate: '2026-11-20', accountId, categoryId: SUBS_CAT }
    await expect(createSubscription({ ...base, amount: 0 })).rejects.toThrow('сумму')
    await expect(createSubscription({ ...base, name: ' ' })).rejects.toThrow('название')
    await expect(createSubscription({ ...base, categoryId: 'seed-income-1' })).rejects.toThrow('категорию')
  })

  it('«Проведено» записывает трату датой списания и сдвигает дату; «Отменить» возвращает как было', async () => {
    const { id, accountId } = await setup('2026-11-15')
    const { transactionId, prevNextDate } = await markSubscriptionPaid(id, '2026-11-17')
    const t = await db.transactions.get(transactionId)
    expect(t).toMatchObject({ type: 'expense', amount: 79900, date: '2026-11-15', accountId, categoryId: SUBS_CAT, comment: 'Кино', subscriptionId: id })
    expect((await db.subscriptions.get(id))?.nextDate).toBe('2026-12-15')

    await undoSubscriptionCharge(id, prevNextDate, transactionId)
    expect(await db.transactions.count()).toBe(0)
    expect((await db.subscriptions.get(id))?.nextDate).toBe('2026-11-15')
  })

  it('отметили заранее — трата записывается сегодняшним днём', async () => {
    const { id } = await setup('2026-11-20')
    const { transactionId } = await markSubscriptionPaid(id, '2026-11-17')
    expect((await db.transactions.get(transactionId))?.date).toBe('2026-11-17')
  })

  it('«Пропустить» сдвигает дату без траты', async () => {
    const { id } = await setup('2026-08-20')
    expect(await skipSubscriptionCharge(id)).toBe('2026-08-20')
    expect((await db.subscriptions.get(id))?.nextDate).toBe('2026-09-20')
    expect(await db.transactions.count()).toBe(0)
  })

  it('правка даты вручную меняет «число месяца»', async () => {
    const { id, accountId } = await setup('2026-11-20')
    await updateSubscription(id, { name: 'Кино', amount: 99900, period: 'month', nextDate: '2026-11-05', accountId, categoryId: SUBS_CAT })
    expect(await db.subscriptions.get(id)).toMatchObject({ amount: 99900, anchorDay: 5 })
  })

  it('объединение категорий переносит и подписки', async () => {
    const { accountId } = await setup()
    const streaming = await createCategory({ name: 'Стриминг', kind: 'expense', emoji: '🎬', color: '#000' })
    const sid = await createSubscription({ name: 'Музыка', amount: 100, period: 'month', nextDate: '2026-11-20', accountId, categoryId: streaming })
    await mergeCategories(streaming, SUBS_CAT)
    expect((await db.subscriptions.get(sid))?.categoryId).toBe(SUBS_CAT)
  })

  it('нельзя удалить категорию или счёт, к которым привязана подписка', async () => {
    const { accountId } = await setup()
    await expect(deleteCategory(SUBS_CAT)).rejects.toThrow('подписки')
    await expect(deleteAccount(accountId)).rejects.toThrow('подписки')
  })

  it('«Проведено» тоже предупреждает о лимите', async () => {
    const { id } = await setup('2026-11-15')
    await setBudget(SUBS_CAT, 50000, '2026-11')
    const { warning } = await withBudgetWarning(SUBS_CAT, '2026-11-15', () => markSubscriptionPaid(id, '2026-11-17'))
    expect(warning).toBe('🔴 Подписки: лимит превышен на 299 ₽')
  })
})

describe('обновление базы с версии 2', () => {
  it('бюджеты и операции этапа 3 сохраняются, появляется таблица подписок', async () => {
    const name = 'quidly-migration-v2'
    await Dexie.delete(name)
    const v2 = new Dexie(name)
    v2.version(1).stores({
      accounts: 'id, order, archived',
      categories: 'id, kind, order',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt',
      meta: 'key',
    })
    v2.version(2).stores({ budgets: 'id, categoryId, fromMonth', closings: 'month' })
    await v2.open()
    await v2.table('transactions').add({ id: 't1', type: 'expense', amount: 100, date: '2026-11-17', accountId: 'a', categoryId: 'c', createdAt: 1, updatedAt: 1 })
    await v2.table('budgets').add({ id: 'b1', categoryId: 'c', limit: 500, fromMonth: '2026-11' })
    await v2.table('closings').add({ month: '2026-10', closedAt: 1, auto: true, actions: {}, carries: { c: 5 }, covered: {} })
    v2.close()

    const v3 = new QuidlyDB(name)
    await v3.open()
    expect(v3.verno).toBe(3)
    expect(await v3.transactions.get('t1')).toMatchObject({ amount: 100 })
    expect(await v3.budgets.get('b1')).toMatchObject({ limit: 500 })
    expect(await v3.closings.get('2026-10')).toMatchObject({ carries: { c: 5 } })
    expect(await v3.subscriptions.count()).toBe(0)
    // новый индекс работает и для старых операций
    expect(await v3.transactions.where('subscriptionId').equals('x').count()).toBe(0)
    v3.close()
    await Dexie.delete(name)
  })
})

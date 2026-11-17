import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { budgetFor } from '../lib/budget'
import { resetDb } from '../test/resetDb'
import { db, QuidlyDB } from './db'
import {
  addTransaction,
  autoCloseMonths,
  closeBudgetMonth,
  createAccount,
  createCategory,
  loadBudgetContext,
  mergeCategories,
  setBudget,
  setMeta,
  META,
  updateCategory,
} from './repo'
import { TOTAL_BUDGET } from './types'

beforeEach(resetDb)

const FOOD = 'seed-expense-1'
const CAFE = 'seed-expense-2'
const BUS = 'seed-expense-3'

async function account() {
  return createAccount({ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 0 })
}
async function spend(accountId: string, categoryId: string, rub: number, date: string) {
  await addTransaction({ type: 'expense', amount: rub * 100, date, accountId, categoryId })
}

describe('лимиты в базе', () => {
  it('повторная установка в том же месяце заменяет, в новом месяце — добавляет запись', async () => {
    await setBudget(FOOD, 1000000, '2026-10')
    await setBudget(FOOD, 1200000, '2026-10')
    await setBudget(FOOD, 900000, '2026-11')
    const all = await db.budgets.where('categoryId').equals(FOOD).sortBy('fromMonth')
    expect(all.map((r) => [r.fromMonth, r.limit])).toEqual([
      ['2026-10', 1200000],
      ['2026-11', 900000],
    ])
  })

  it('отрицательный лимит не принимается', async () => {
    await expect(setBudget(FOOD, -1, '2026-10')).rejects.toThrow()
  })

  it('выключение переноса остатка у категории', async () => {
    await updateCategory(CAFE, { budgetRollover: false })
    const ctx = await loadBudgetContext()
    expect(ctx.rolloverOff.has(CAFE)).toBe(true)
  })
})

describe('итоги месяца', () => {
  it('ручное закрытие: «покрыть перерасход» и перенос в следующий месяц', async () => {
    const a = await account()
    await setBudget(CAFE, 300000, '2026-10')
    await setBudget(BUS, 200000, '2026-10')
    await spend(a, CAFE, 2500, '2026-10-05') // остаток 500
    await spend(a, BUS, 2800, '2026-10-06') // перерасход 800

    const closing = await closeBudgetMonth('2026-10', { [CAFE]: { type: 'cover', to: BUS } })
    expect(closing.covered).toEqual({ [BUS]: 50000 })
    expect(closing.carries).toEqual({})

    const nov = budgetFor(await loadBudgetContext(), '2026-11')
    expect(nov.categories.find((c) => c.categoryId === CAFE)?.available).toBe(300000)
  })

  it('дважды закрыть один месяц нельзя', async () => {
    await setBudget(FOOD, 100000, '2026-10')
    await closeBudgetMonth('2026-10')
    await expect(closeBudgetMonth('2026-10')).rejects.toThrow('уже')
  })

  it('автозакрытие с 8-го числа переносит остаток по умолчанию', async () => {
    const a = await account()
    await setBudget(FOOD, 1000000, '2026-10')
    await spend(a, FOOD, 8800, '2026-10-10')

    expect(await autoCloseMonths('2026-11-07')).toEqual([])
    expect(await autoCloseMonths('2026-11-08')).toEqual(['2026-10'])
    const closing = await db.closings.get('2026-10')
    expect(closing).toMatchObject({ auto: true, carries: { [FOOD]: 120000 } })
    // повторный запуск ничего не делает
    expect(await autoCloseMonths('2026-11-20')).toEqual([])
  })

  it('перенос перерасхода включается настройкой', async () => {
    const a = await account()
    await setBudget(FOOD, 100000, '2026-10')
    await spend(a, FOOD, 1500, '2026-10-10')
    await setMeta(META.carryOverspend, true)
    const closing = await closeBudgetMonth('2026-10')
    expect(closing.carries).toEqual({ [FOOD]: -50000 })
  })

  it('общий лимит, вписанный вручную', async () => {
    await setBudget(FOOD, 1000000, '2026-11')
    await setBudget(TOTAL_BUDGET, 5000000, '2026-11')
    const nov = budgetFor(await loadBudgetContext(), '2026-11')
    expect(nov.total).toMatchObject({ limit: 5000000, custom: true })
    await setBudget(TOTAL_BUDGET, null, '2026-11')
    expect(budgetFor(await loadBudgetContext(), '2026-11').total).toMatchObject({ limit: 1000000, custom: false })
  })
})

describe('объединение категорий и бюджеты', () => {
  it('бюджет переходит к категории без своего бюджета', async () => {
    const coffee = await createCategory({ name: 'Кофе', kind: 'expense', emoji: '☕', color: '#000' })
    await setBudget(coffee, 200000, '2026-11')
    await mergeCategories(coffee, BUS)
    expect((await db.budgets.toArray()).map((b) => b.categoryId)).toEqual([BUS])
  })

  it('если у получателя есть бюджет — остаётся его бюджет', async () => {
    const coffee = await createCategory({ name: 'Кофе', kind: 'expense', emoji: '☕', color: '#000' })
    await setBudget(coffee, 200000, '2026-11')
    await setBudget(CAFE, 500000, '2026-11')
    await mergeCategories(coffee, CAFE)
    const all = await db.budgets.toArray()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ categoryId: CAFE, limit: 500000 })
  })
})

describe('обновление базы с версии 1 (сразу до последней)', () => {
  it('данные этапа 2 сохраняются, новые таблицы появляются', async () => {
    const name = 'quidly-migration-test'
    await Dexie.delete(name)

    // База «как у пользователя после этапа 2»
    const v1 = new Dexie(name)
    v1.version(1).stores({
      accounts: 'id, order, archived',
      categories: 'id, kind, order',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt',
      meta: 'key',
    })
    await v1.open()
    await v1.table('accounts').add({ id: 'acc', name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 500, archived: false, order: 0, createdAt: 1 })
    await v1.table('categories').add({ id: 'seed-expense-1', name: 'Продукты', kind: 'expense', emoji: '🛒', color: '#0f0', order: 0, createdAt: 1 })
    await v1.table('transactions').add({ id: 't1', type: 'expense', amount: 100, date: '2026-11-17', accountId: 'acc', categoryId: 'seed-expense-1', createdAt: 1, updatedAt: 1 })
    v1.close()

    // Открываем новой версией приложения
    const v2 = new QuidlyDB(name)
    await v2.open()
    expect(v2.verno).toBe(4)
    expect(await v2.accounts.get('acc')).toMatchObject({ name: 'Карта', initialBalance: 500 })
    expect(await v2.transactions.count()).toBe(1)
    expect(await v2.categories.count()).toBe(1) // стартовые категории повторно не добавляются
    expect(await v2.budgets.count()).toBe(0)
    expect(await v2.closings.count()).toBe(0)
    expect(await v2.subscriptions.count()).toBe(0)
    v2.close()
    await Dexie.delete(name)
  })
})

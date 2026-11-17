import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/resetDb'
import { db, QuidlyDB } from './db'
import {
  addGoalMove,
  addTransaction,
  closeBudgetMonth,
  createAccount,
  createGoal,
  deleteGoal,
  deleteGoalMove,
  goalBalance,
  setBudget,
  updateGoal,
} from './repo'

beforeEach(resetDb)

const CAFE = 'seed-expense-2'
const trip = { name: 'Отпуск', emoji: '🏖️', color: '#0ea5e9', target: 1000000 }

describe('копилки в базе', () => {
  it('проверки при создании', async () => {
    await expect(createGoal({ ...trip, name: ' ' })).rejects.toThrow('название')
    await expect(createGoal({ ...trip, target: 0 })).rejects.toThrow('накопить')
  })

  it('пополнение и снятие; снять больше, чем лежит, нельзя', async () => {
    const id = await createGoal(trip)
    await addGoalMove(id, 300000, '2026-11-17')
    await addGoalMove(id, -100000, '2026-11-18', { comment: ' на билеты ' })
    expect(await goalBalance(id)).toBe(200000)
    await expect(addGoalMove(id, -200001, '2026-11-18')).rejects.toThrow('нет')
    const moves = await db.goalMoves.where('goalId').equals(id).sortBy('date')
    expect(moves[1]).toMatchObject({ amount: -100000, comment: 'на билеты', source: 'manual' })
  })

  it('копилки не меняют балансы счетов и не создают операций', async () => {
    await createAccount({ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 500000 })
    const id = await createGoal(trip)
    await addGoalMove(id, 300000, '2026-11-17')
    expect(await db.transactions.count()).toBe(0)
    expect((await db.accounts.toArray())[0].initialBalance).toBe(500000)
  })

  it('достижение цели отмечается один раз', async () => {
    const id = await createGoal(trip)
    expect((await addGoalMove(id, 900000, '2026-11-17')).achieved).toBe(false)
    const second = await addGoalMove(id, 200000, '2026-11-18')
    expect(second.achieved).toBe(true)
    expect((await db.goals.get(id))?.achievedAt).toBeTruthy()
    // сняли и снова пополнили — конфетти второй раз не будет
    await addGoalMove(id, -500000, '2026-11-19')
    expect((await addGoalMove(id, 500000, '2026-11-20')).achieved).toBe(false)
  })

  it('отмена пополнения', async () => {
    const id = await createGoal(trip)
    const { moveId } = await addGoalMove(id, 300000, '2026-11-17')
    await deleteGoalMove(moveId)
    expect(await goalBalance(id)).toBe(0)
  })

  it('срок можно убрать', async () => {
    const id = await createGoal({ ...trip, deadline: '2027-06-01' })
    await updateGoal(id, { ...trip })
    expect((await db.goals.get(id))?.deadline).toBeUndefined()
  })

  it('удаление копилки удаляет и её историю', async () => {
    const id = await createGoal(trip)
    await addGoalMove(id, 100, '2026-11-17')
    await deleteGoal(id)
    expect(await db.goalMoves.count()).toBe(0)
  })
})

describe('«🐷 В копилку» в итогах месяца', () => {
  it('остаток категории пополняет копилку последним днём месяца', async () => {
    const accountId = await createAccount({ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 0 })
    await setBudget(CAFE, 300000, '2026-10')
    await addTransaction({ type: 'expense', amount: 250000, date: '2026-10-05', accountId, categoryId: CAFE })
    const goalId = await createGoal({ ...trip, target: 50000 })

    const closing = await closeBudgetMonth('2026-10', { [CAFE]: { type: 'goal', goalId } })
    expect(closing.toGoals).toEqual({ [CAFE]: { goalId, amount: 50000 } })
    expect(closing.carries).toEqual({})
    expect(closing.achievedGoals).toEqual([goalId])

    const [m] = await db.goalMoves.toArray()
    expect(m).toMatchObject({ goalId, amount: 50000, date: '2026-10-31', source: 'closing', comment: 'Остаток «Кафе» за октябрь' })
  })

  it('если копилку удалили — остаток просто переносится', async () => {
    await setBudget(CAFE, 300000, '2026-10')
    const closing = await closeBudgetMonth('2026-10', { [CAFE]: { type: 'goal', goalId: 'нет-такой' } })
    expect(closing.carries).toEqual({ [CAFE]: 300000 })
    expect(await db.goalMoves.count()).toBe(0)
  })
})

describe('обновление базы с версии 3', () => {
  it('подписки и операции сохраняются, появляются копилки', async () => {
    const name = 'quidly-migration-v3'
    await Dexie.delete(name)
    const old = new Dexie(name)
    old.version(1).stores({
      accounts: 'id, order, archived',
      categories: 'id, kind, order',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt',
      meta: 'key',
    })
    old.version(2).stores({ budgets: 'id, categoryId, fromMonth', closings: 'month' })
    old.version(3).stores({
      subscriptions: 'id, nextDate, categoryId, accountId',
      transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt, subscriptionId',
    })
    await old.open()
    await old.table('subscriptions').add({ id: 's1', name: 'Кино', amount: 100, period: 'month', nextDate: '2026-11-20', anchorDay: 20, accountId: 'a', categoryId: 'c', paused: false, createdAt: 1 })
    await old.table('transactions').add({ id: 't1', type: 'expense', amount: 100, date: '2026-11-17', accountId: 'a', categoryId: 'c', subscriptionId: 's1', createdAt: 1, updatedAt: 1 })
    old.close()

    const v4 = new QuidlyDB(name)
    await v4.open()
    expect(v4.verno).toBe(5)
    expect(await v4.subscriptions.get('s1')).toMatchObject({ name: 'Кино' })
    expect(await v4.transactions.where('subscriptionId').equals('s1').count()).toBe(1)
    expect(await v4.goals.count()).toBe(0)
    expect(await v4.goalMoves.count()).toBe(0)
    v4.close()
    await Dexie.delete(name)
  })
})

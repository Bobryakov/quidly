import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildPlan } from '../import/plan'
import type { ParsedRow } from '../import/types'
import { computeBalances } from '../lib/balance'
import { resetDb } from '../test/resetDb'
import { db, QuidlyDB } from './db'
import { applyImport, createAccount, createCategory, createSubscription, deleteCategory, mergeCategories, saveImportRule } from './repo'

beforeEach(resetDb)

const OTHER = 'seed-expense-12' // Прочее
const row = (p: Partial<ParsedRow>): ParsedRow => ({
  date: '2026-11-10', time: '12:00', amount: 10000, direction: 'out', description: 'SHOP', bankCategory: 'Супермаркеты', ...p,
})

async function setup() {
  const sber = await createAccount({ name: 'Сбер', type: 'card', emoji: '', color: '', initialBalance: 1000000 })
  const cash = await createAccount({ name: 'Наличные', type: 'cash', emoji: '', color: '', initialBalance: 0 })
  return { sber, cash }
}

async function planFor(rows: ParsedRow[], accountId: string) {
  return buildPlan({
    statement: { bank: 'sber', bankName: 'Сбер', rows },
    accountId,
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    rules: await db.importRules.toArray(),
    transactions: await db.transactions.toArray(),
    subscriptions: await db.subscriptions.toArray(),
  })
}

describe('запись импорта', () => {
  it('записывает отмеченные строки с меткой импорта и описанием в комментарии', async () => {
    const { sber } = await setup()
    const items = await planFor([row({}), row({ direction: 'in', bankCategory: 'Перевод на карту', description: 'Перевод от Т.', time: '13:00' })], sber)
    expect(await applyImport(items, sber)).toBe(2)
    const txs = await db.transactions.orderBy('createdAt').toArray()
    expect(txs.map((t) => [t.type, t.amount, t.comment, t.importKey?.startsWith('sber|')])).toEqual([
      ['expense', 10000, 'SHOP', true],
      ['income', 10000, 'Перевод от Т.', true],
    ])
  })

  it('повторный импорт той же выписки ничего не задваивает', async () => {
    const { sber } = await setup()
    const rows = [row({}), row({ time: '13:00' })]
    await applyImport(await planFor(rows, sber), sber)
    const again = await planFor(rows, sber)
    expect(again.every((i) => i.status === 'duplicate' && !i.include)).toBe(true)
    expect(await applyImport(again, sber)).toBe(0)
    // даже если вручную отметить дубли — второй раз не запишутся
    expect(await applyImport(again.map((i) => ({ ...i, include: true })), sber)).toBe(0)
    expect(await db.transactions.count()).toBe(2)
  })

  it('снятие наличных: перевод на «Наличные» + комиссия отдельной тратой; балансы сходятся с банком', async () => {
    const { sber, cash } = await setup()
    const items = await planFor([row({ bankCategory: 'Выдача наличных', description: 'Банкомат', amount: 120000, fee: 20000 })], sber)
    await applyImport(items, sber)
    const txs = await db.transactions.toArray()
    expect(txs.map((t) => [t.type, t.amount, t.categoryId ?? t.toAccountId]).sort()).toEqual([
      ['expense', 20000, OTHER],
      ['transfer', 100000, cash],
    ])
    const b = computeBalances(await db.accounts.toArray(), txs)
    expect(b.get(sber)).toBe(1000000 - 120000) // как в выписке банка
    expect(b.get(cash)).toBe(100000)
  })

  it('исправленные категории запоминаются правилами и срабатывают при следующем импорте', async () => {
    const { sber } = await setup()
    const items = await planFor([row({ description: 'KOPIRKA 1 MOSCOW RUS', bankCategory: 'Прочие расходы' })], sber)
    items[0] = { ...items[0], categoryId: 'seed-expense-11' } // Образование
    await applyImport(items, sber, [{ pattern: 'KOPIRKA', categoryId: 'seed-expense-11' }])
    const next = await planFor([row({ description: 'KOPIRKA 2 MOSCOW RUS', bankCategory: 'Прочие расходы', date: '2026-11-20' })], sber)
    expect(next[0]).toMatchObject({ categoryId: 'seed-expense-11', categorySource: 'rule' })
  })

  it('найденное списание подписки сдвигает её дату', async () => {
    const { sber } = await setup()
    const subId = await createSubscription({ name: 'Кино', amount: 29900, period: 'month', nextDate: '2026-11-12', accountId: sber, categoryId: 'seed-expense-6' })
    const items = await planFor([row({ amount: 29900, date: '2026-11-11', description: 'KINO' })], sber)
    await applyImport(items, sber)
    expect((await db.subscriptions.get(subId))?.nextDate).toBe('2026-12-12')
    expect((await db.transactions.toArray())[0].subscriptionId).toBe(subId)
  })

  it('выравнивание остатка: на дату выписки баланс счёта совпадает с банком', async () => {
    const { sber } = await setup() // вписан остаток 10 000 «на сегодня»
    // позже конца выписки уже есть ручная трата — её выравнивание не трогает
    await db.transactions.add({ id: 'late', type: 'expense', amount: 5000, date: '2026-11-20', accountId: sber, categoryId: OTHER, createdAt: 1, updatedAt: 1 })
    const items = await planFor([row({ amount: 30000 }), row({ direction: 'in', amount: 100000, bankCategory: 'Зарплата', time: '13:00' })], sber)
    await applyImport(items, sber, [], { date: '2026-11-17', amount: 1234500 })
    const all = await db.transactions.toArray()
    const upTo = all.filter((t) => t.date <= '2026-11-17')
    expect(computeBalances(await db.accounts.toArray(), upTo).get(sber)).toBe(1234500)
    expect(computeBalances(await db.accounts.toArray(), all).get(sber)).toBe(1234500 - 5000)
  })

  it('ошибка в одной строке — не записывается ничего', async () => {
    const { sber } = await setup()
    const items = await planFor([row({}), row({ time: '13:00' })], sber)
    items[1] = { ...items[1], categoryId: 'нет-такой' }
    await expect(applyImport(items, sber)).rejects.toThrow()
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('правила и категории', () => {
  it('правило обновляется, а не дублируется', async () => {
    await saveImportRule('kopirka', 'seed-expense-11')
    await saveImportRule('KOPIRKA', 'seed-expense-12')
    expect(await db.importRules.toArray()).toMatchObject([{ pattern: 'KOPIRKA', categoryId: 'seed-expense-12' }])
  })

  it('объединение категорий переносит правила; удаление пустой категории удаляет её правила', async () => {
    const c = await createCategory({ name: 'Печать', kind: 'expense', emoji: '', color: '' })
    await saveImportRule('KOPIRKA', c)
    await mergeCategories(c, OTHER)
    expect((await db.importRules.toArray())[0].categoryId).toBe(OTHER)
    const d = await createCategory({ name: 'Временная', kind: 'expense', emoji: '', color: '' })
    await saveImportRule('TEMP', d)
    await deleteCategory(d)
    expect(await db.importRules.where('categoryId').equals(d).count()).toBe(0)
  })
})

describe('обновление базы с версии 4', () => {
  it('копилки и операции сохраняются, появляются правила импорта', async () => {
    const name = 'quidly-migration-v4'
    await Dexie.delete(name)
    const old = new Dexie(name)
    old.version(1).stores({ accounts: 'id, order, archived', categories: 'id, kind, order', transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt', meta: 'key' })
    old.version(2).stores({ budgets: 'id, categoryId, fromMonth', closings: 'month' })
    old.version(3).stores({ subscriptions: 'id, nextDate, categoryId, accountId', transactions: 'id, date, type, accountId, toAccountId, categoryId, createdAt, subscriptionId' })
    old.version(4).stores({ goals: 'id, createdAt', goalMoves: 'id, goalId, date' })
    await old.open()
    await old.table('goals').add({ id: 'g', name: 'Отпуск', emoji: '', color: '', target: 100, createdAt: 1 })
    await old.table('transactions').add({ id: 't1', type: 'expense', amount: 100, date: '2026-11-17', accountId: 'a', categoryId: 'c', createdAt: 1, updatedAt: 1 })
    old.close()

    const v5 = new QuidlyDB(name)
    await v5.open()
    expect(v5.verno).toBe(6)
    expect(await v5.goals.get('g')).toMatchObject({ name: 'Отпуск' })
    expect(await v5.transactions.get('t1')).toMatchObject({ amount: 100 })
    expect(await v5.importRules.count()).toBe(0)
    expect(await v5.transactions.where('importKey').equals('x').count()).toBe(0)
    v5.close()
    await Dexie.delete(name)
  })
})

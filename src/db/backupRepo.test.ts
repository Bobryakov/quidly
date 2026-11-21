import { beforeEach, describe, expect, it } from 'vitest'
import { buildBackup, openBackup, parseBackup, type BackupData } from '../lib/backup'
import { computeBalances } from '../lib/balance'
import { resetDb } from '../test/resetDb'
import { collectBackupData, makeBackupText, markBackupSaved, restoreBackupData, snoozeBackupReminder } from './backupRepo'
import { db, SCHEMA_VERSION } from './db'
import { addGoalMove, addTransaction, createAccount, createGoal, getMeta, META, saveImportRule, setBudget, setMeta } from './repo'
import { checkPin, getPinRecord, removePin, setBiometric, setPin } from './securityRepo'

beforeEach(resetDb)

const FAST = 1000

async function fill() {
  const card = await createAccount({ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 1000000 })
  await addTransaction({ type: 'expense', amount: 25000, date: '2026-11-20', accountId: card, categoryId: 'seed-expense-1', comment: 'Хлеб' })
  await setBudget('seed-expense-1', 2000000, '2026-11')
  const goal = await createGoal({ name: 'Отпуск', emoji: '🏖️', color: '#000', target: 5000000 })
  await addGoalMove(goal, 100000, '2026-11-20')
  await saveImportRule('pyaterochka', 'seed-expense-1')
  await setMeta(META.subscriptionNoticeDays, 7)
  return card
}

async function open(text: string, password?: string) {
  const p = parseBackup(text, SCHEMA_VERSION)
  if (!p.ok) throw new Error(p.error)
  const r = await openBackup(p.file, password)
  if (!r.ok) throw new Error(r.error)
  return r.data
}

describe('резервная копия базы', () => {
  it('в копию попадают все данные, но не PIN, отпечаток и даты копий этого телефона', async () => {
    await fill()
    await setPin('2580', FAST)
    await setBiometric({ credentialId: 'x', publicKey: 'y', alg: -7 })
    await markBackupSaved(123)
    const data = await collectBackupData()
    expect(data.accounts).toHaveLength(1)
    expect(data.transactions).toHaveLength(1)
    expect(data.categories.length).toBeGreaterThan(10)
    expect(data.budgets).toHaveLength(1)
    expect(data.goalMoves).toHaveLength(1)
    expect(data.importRules).toHaveLength(1)
    expect(data.meta.map((m) => m.key).sort()).toEqual([META.lastAccountId, META.subscriptionNoticeDays].sort())
  })

  it('сохранить → стереть → восстановить: всё как было (с паролем)', async () => {
    await fill()
    const before = await collectBackupData()
    const text = await makeBackupText('мойпароль')
    await resetDb()
    expect(await db.accounts.count()).toBe(0)
    await restoreBackupData(await open(text, 'мойпароль'))
    expect(await collectBackupData()).toEqual(before)
  })

  it('восстановление заменяет текущие данные целиком, а PIN телефона остаётся', async () => {
    await fill()
    const text = await makeBackupText()
    // «Новый телефон»: другие данные и свой PIN
    await resetDb()
    const other = await createAccount({ name: 'Другой', type: 'cash', emoji: '', color: '', initialBalance: 0 })
    await addTransaction({ type: 'income', amount: 100, date: '2026-11-21', accountId: other, categoryId: 'seed-income-1' })
    await setPin('1111', FAST)
    await markBackupSaved(555)

    await restoreBackupData(await open(text))
    expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['Карта'])
    expect((await db.transactions.toArray()).map((t) => t.comment)).toEqual(['Хлеб'])
    expect(await getPinRecord()).toBeDefined()
    expect(await checkPin('1111')).toEqual({ ok: true })
    expect(await getMeta(META.lastBackupAt)).toBe(555)
    expect(await getMeta(META.subscriptionNoticeDays)).toBe(7)
  })

  it('если восстановление сорвалось — текущие данные не тронуты', async () => {
    const card = await fill()
    const broken = (await collectBackupData()) as BackupData
    broken.transactions = [broken.transactions[0], { ...broken.transactions[0] }] // повтор ключа — база откажется
    await addTransaction({ type: 'expense', amount: 1, date: '2026-11-21', accountId: card, categoryId: 'seed-expense-2' })
    await expect(restoreBackupData(broken)).rejects.toThrow()
    expect(await db.transactions.count()).toBe(2)
    expect(await db.accounts.count()).toBe(1)
  })

  it('копия первой версии базы восстанавливается и работает', async () => {
    const v1 = {
      accounts: [{ id: 'a', name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 50000, archived: false, order: 0, createdAt: 1 }],
      categories: [{ id: 'seed-expense-1', name: 'Продукты', kind: 'expense', emoji: '🛒', color: '#000', order: 0, createdAt: 1 }],
      transactions: [{ id: 't', type: 'expense', amount: 10000, date: '2026-10-01', accountId: 'a', categoryId: 'seed-expense-1', createdAt: 2, updatedAt: 2 }],
      meta: [],
    }
    const text = await buildBackup(v1 as unknown as BackupData, { schemaVersion: 1 })
    await restoreBackupData(await open(text))
    const balances = computeBalances(await db.accounts.toArray(), await db.transactions.toArray())
    expect(balances.get('a')).toBe(40000)
    expect(await db.goals.count()).toBe(0)
    expect(await db.categories.count()).toBe(1)
  })

  it('отметка о сохранённой копии сбрасывает «Завтра»', async () => {
    await snoozeBackupReminder(1000)
    expect(await getMeta(META.backupSnoozeUntil)).toBe(1000 + 86_400_000)
    await markBackupSaved(2000)
    expect(await getMeta(META.lastBackupAt)).toBe(2000)
    expect(await getMeta(META.backupSnoozeUntil)).toBeUndefined()
  })
})

describe('PIN в базе', () => {
  it('ошибки считаются, после пятой — пауза 30 секунд; верный PIN во время паузы не пускает', async () => {
    await setPin('2580', FAST)
    for (let i = 1; i <= 4; i++) {
      const r = await checkPin('0000', 1000)
      expect(r).toEqual({ ok: false, fails: { count: i } })
    }
    expect(await checkPin('0000', 1000)).toEqual({ ok: false, blockedUntil: 31_000 })
    expect(await checkPin('2580', 20_000)).toEqual({ ok: false, blockedUntil: 31_000 })
    expect(await checkPin('2580', 31_000)).toEqual({ ok: true })
    expect(await getMeta(META.pinFails)).toBeUndefined()
  })

  it('выключение PIN убирает и отпечаток', async () => {
    await setPin('2580', FAST)
    await setBiometric({ credentialId: 'x', publicKey: 'y', alg: -7 })
    await removePin()
    expect(await getPinRecord()).toBeUndefined()
    expect(await getMeta(META.biometric)).toBeUndefined()
    expect(await checkPin('anything')).toEqual({ ok: true })
  })
})

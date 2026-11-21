import { describe, expect, it } from 'vitest'
import type { BackupData } from './backup'
import { backupReminder, buildBackup, migrateBackup, openBackup, parseBackup, summarize, validateData } from './backup'

const FAST = 1000

function sample(): BackupData {
  return {
    accounts: [{ id: 'a1', name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 150000, archived: false, order: 0, createdAt: 1 }],
    categories: [{ id: 'c1', name: 'Продукты', kind: 'expense', emoji: '🛒', color: '#000', order: 0, createdAt: 1 }],
    transactions: [
      { id: 't1', type: 'expense', amount: 4500, date: '2026-11-20', accountId: 'a1', categoryId: 'c1', comment: 'Хлеб', createdAt: 2, updatedAt: 2 },
    ],
    meta: [{ key: 'subscriptionNoticeDays', value: 3 }],
    budgets: [],
    closings: [],
    subscriptions: [],
    goals: [{ id: 'g1', name: 'Отпуск', emoji: '🏖️', color: '#000', target: 10000000, createdAt: 3 }],
    goalMoves: [],
    importRules: [],
  }
}

const NOW = new Date(2026, 10, 21, 14, 5)

async function roundTrip(text: string, password?: string) {
  const parsed = parseBackup(text, 6)
  if (!parsed.ok) return parsed
  return openBackup(parsed.file, password)
}

describe('резервная копия', () => {
  it('без пароля: сохраняется и читается обратно точь-в-точь, с версией базы', async () => {
    const text = await buildBackup(sample(), { schemaVersion: 6, now: NOW })
    const file = JSON.parse(text)
    expect(file).toMatchObject({ app: 'quidly', kind: 'backup', format: 1, schemaVersion: 6, createdAt: NOW.toISOString() })
    expect(file.checksum).toMatch(/^[0-9a-f]{64}$/)
    const r = await roundTrip(text)
    expect(r).toMatchObject({ ok: true })
    if (r.ok) {
      expect(r.data).toEqual(sample())
      expect(r.createdAt).toEqual(NOW)
      expect(summarize(r.data)).toEqual({ accounts: 1, transactions: 1, goals: 1, subscriptions: 0 })
    }
  })

  it('с паролем: в файле ничего не видно, без пароля и с неверным — не открывается', async () => {
    const text = await buildBackup(sample(), { schemaVersion: 6, password: 'секрет123', iterations: FAST })
    expect(text).not.toContain('Хлеб')
    expect(text).not.toContain('Карта')
    expect(JSON.parse(text).encrypted.iterations).toBe(FAST)
    expect(await roundTrip(text)).toEqual({ ok: false, error: 'need-password' })
    expect(await roundTrip(text, 'секрет124')).toEqual({ ok: false, error: 'wrong-password' })
    const r = await roundTrip(text, 'секрет123')
    expect(r.ok && r.data).toEqual(sample())
  })

  it('по умолчанию ключ из пароля — 600 000 повторений', async () => {
    const text = await buildBackup(sample(), { schemaVersion: 6, password: 'x' })
    expect(JSON.parse(text).encrypted.iterations).toBe(600_000)
  })

  it('изменённый или испорченный файл не восстанавливается', async () => {
    const file = JSON.parse(await buildBackup(sample(), { schemaVersion: 6 }))
    file.data.transactions[0].amount = 1
    expect(await roundTrip(JSON.stringify(file))).toMatchObject({ ok: false, error: 'damaged' })

    const enc = JSON.parse(await buildBackup(sample(), { schemaVersion: 6, password: 'pass12', iterations: FAST }))
    enc.encrypted.ciphertext = enc.encrypted.ciphertext.replace(/^./, (c: string) => (c === 'A' ? 'B' : 'A'))
    // шифр с проверкой: любое изменение = «не открыть»
    expect(await roundTrip(JSON.stringify(enc), 'pass12')).toMatchObject({ ok: false })
  })

  it('чужие файлы и файлы из будущей версии', () => {
    expect(parseBackup('привет', 5)).toEqual({ ok: false, error: 'not-json' })
    expect(parseBackup('{"a":1}', 5)).toEqual({ ok: false, error: 'not-quidly' })
    expect(parseBackup('null', 5)).toEqual({ ok: false, error: 'not-quidly' })
    const future = JSON.stringify({ app: 'quidly', kind: 'backup', format: 1, schemaVersion: 6, createdAt: '', data: {}, checksum: '' })
    expect(parseBackup(future, 5)).toEqual({ ok: false, error: 'too-new' })
    expect(parseBackup(JSON.stringify({ app: 'quidly', kind: 'backup', format: 1, schemaVersion: 5, createdAt: '' }), 5)).toEqual({ ok: false, error: 'damaged' })
  })

  it('файл с невидимой меткой кодировки в начале тоже читается', async () => {
    const text = '﻿' + (await buildBackup(sample(), { schemaVersion: 6 }))
    expect(await roundTrip(text)).toMatchObject({ ok: true })
  })

  it('копия старой версии (v1) дополняется до текущей', async () => {
    const s = sample()
    const v1 = { accounts: s.accounts, categories: s.categories, transactions: s.transactions, meta: s.meta }
    const text = await buildBackup(v1 as unknown as BackupData, { schemaVersion: 1 })
    const r = await roundTrip(text)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.schemaVersion).toBe(1)
      expect(r.data.goals).toEqual([])
      expect(r.data.importRules).toEqual([])
      expect(r.data.budgets).toEqual([])
      expect(r.data.transactions).toEqual(s.transactions)
    }
    expect(Object.keys(migrateBackup(v1, 3)).sort()).toEqual(Object.keys(s).sort())
  })

  it('копия версии 5 получает новые категории «Кредиты» и «ЖКХ»; свою «жкх» не задваивает', async () => {
    const s = sample()
    s.categories.push({ id: 'my', name: 'жкх ', kind: 'expense', emoji: '💡', color: '#000', order: 5, createdAt: 1 })
    const r = await roundTrip(await buildBackup(s, { schemaVersion: 5 }))
    expect(r.ok && r.data.categories.map((c) => c.name)).toEqual(['Продукты', 'жкх ', 'Кредиты'])
  })

  it('проверка смысла данных', () => {
    expect(validateData(sample())).toBeNull()
    const noAcc = { ...sample(), accounts: [] }
    expect(validateData(noAcc)).toBe('в копии нет ни одного счёта')
    const s1 = sample()
    s1.transactions[0].accountId = 'нет такого'
    expect(validateData(s1)).toBe('операция ссылается на несуществующий счёт')
    const s2 = sample()
    s2.transactions[0].amount = -5
    expect(validateData(s2)).toBe('испорчена операция')
    const s3 = sample()
    s3.accounts.push({ ...s3.accounts[0] })
    expect(validateData(s3)).toBe('повтор записи в accounts')
    const s4 = sample()
    s4.transactions.push({ ...s4.transactions[0], id: 't2', type: 'transfer' })
    expect(validateData(s4)).toBe('перевод ссылается на несуществующий счёт')
  })
})

describe('напоминание о копии раз в неделю', () => {
  const DAY = 86_400_000
  const base = { now: 100 * DAY, lastBackupAt: null, snoozeUntil: null, firstUseAt: 90 * DAY, hasTransactions: true }

  it('копий не было: через неделю после начала учёта', () => {
    expect(backupReminder({ ...base, firstUseAt: 94 * DAY })).toBeNull()
    expect(backupReminder(base)).toEqual({ daysSince: null })
  })

  it('была копия: через 7 дней после неё', () => {
    expect(backupReminder({ ...base, lastBackupAt: 94 * DAY })).toBeNull()
    expect(backupReminder({ ...base, lastBackupAt: 93 * DAY })).toEqual({ daysSince: 7 })
    expect(backupReminder({ ...base, lastBackupAt: 88 * DAY })).toEqual({ daysSince: 12 })
  })

  it('«Завтра» откладывает; без операций не напоминаем', () => {
    expect(backupReminder({ ...base, snoozeUntil: 100 * DAY + 1 })).toBeNull()
    expect(backupReminder({ ...base, snoozeUntil: 100 * DAY })).toEqual({ daysSince: null })
    expect(backupReminder({ ...base, hasTransactions: false })).toBeNull()
  })
})

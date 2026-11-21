import type {
  Account,
  BudgetRecord,
  Category,
  Goal,
  GoalMove,
  ImportRule,
  MetaRecord,
  MonthClosing,
  Subscription,
  Transaction,
} from '../db/types'
import { withNewSeedCategories } from '../db/seed'
import { fromB64, randomBytes, sha256, toB64, toHex } from './security/bytes'

/**
 * Резервная копия — один JSON-файл со всеми данными и номером версии базы.
 * По желанию файл шифруется паролем (AES-GCM, ключ из пароля через PBKDF2).
 * Копию старой версии можно восстановить в новом приложении: недостающее дополняется (миграции).
 */

export const BACKUP_FORMAT = 1
export const BACKUP_ITERATIONS = 600_000

export interface BackupData {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  meta: MetaRecord[]
  budgets: BudgetRecord[]
  closings: MonthClosing[]
  subscriptions: Subscription[]
  goals: Goal[]
  goalMoves: GoalMove[]
  importRules: ImportRule[]
}

export type TableName = keyof BackupData

export const TABLES: TableName[] = [
  'accounts',
  'categories',
  'transactions',
  'meta',
  'budgets',
  'closings',
  'subscriptions',
  'goals',
  'goalMoves',
  'importRules',
]

/** В какой версии базы появилась таблица (см. db.ts). */
const TABLE_SINCE: Record<TableName, number> = {
  accounts: 1,
  categories: 1,
  transactions: 1,
  meta: 1,
  budgets: 2,
  closings: 2,
  subscriptions: 3,
  goals: 4,
  goalMoves: 4,
  importRules: 5,
}

export interface EncryptedPayload {
  salt: string
  iv: string
  iterations: number
  ciphertext: string
}

export interface BackupFile {
  app: 'quidly'
  kind: 'backup'
  format: number
  schemaVersion: number
  /** ISO-время создания */
  createdAt: string
  data?: BackupData
  /** SHA-256 от данных — чтобы заметить повреждённый файл */
  checksum?: string
  encrypted?: EncryptedPayload
}

export type BackupError = 'not-json' | 'not-quidly' | 'too-new' | 'damaged' | 'need-password' | 'wrong-password'

export const BACKUP_ERROR_TEXT: Record<BackupError, string> = {
  'not-json': 'Это не файл резервной копии Quidly.',
  'not-quidly': 'Это не файл резервной копии Quidly.',
  'too-new': 'Копия сделана в более новой версии Quidly. Обновите приложение и попробуйте снова.',
  damaged: 'Файл копии повреждён или изменён — восстанавливать его нельзя.',
  'need-password': 'Копия защищена паролем — введите его.',
  'wrong-password': 'Неверный пароль.',
}

async function checksumOf(data: BackupData): Promise<string> {
  return toHex(await sha256(JSON.stringify(data)))
}

async function keyFromPassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Собрать текст файла копии. */
export async function buildBackup(
  data: BackupData,
  opts: { schemaVersion: number; password?: string; now?: Date; iterations?: number },
): Promise<string> {
  const checksum = await checksumOf(data)
  const head = {
    app: 'quidly' as const,
    kind: 'backup' as const,
    format: BACKUP_FORMAT,
    schemaVersion: opts.schemaVersion,
    createdAt: (opts.now ?? new Date()).toISOString(),
  }
  if (!opts.password) return JSON.stringify({ ...head, checksum, data } satisfies BackupFile)

  const iterations = opts.iterations ?? BACKUP_ITERATIONS
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = await keyFromPassword(opts.password, salt, iterations)
  const plain = new TextEncoder().encode(JSON.stringify({ checksum, data }))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  const encrypted = { salt: toB64(salt), iv: toB64(iv), iterations, ciphertext: toB64(ciphertext) }
  return JSON.stringify({ ...head, encrypted } satisfies BackupFile)
}

/** Первая проверка файла: наш ли это файл и не из будущей ли он версии. */
export function parseBackup(text: string, currentSchema: number): { ok: true; file: BackupFile } | { ok: false; error: BackupError } {
  let file: BackupFile
  try {
    file = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { ok: false, error: 'not-json' }
  }
  if (!file || typeof file !== 'object' || file.app !== 'quidly' || file.kind !== 'backup') return { ok: false, error: 'not-quidly' }
  if (typeof file.schemaVersion !== 'number' || typeof file.format !== 'number') return { ok: false, error: 'damaged' }
  if (file.schemaVersion > currentSchema || file.format > BACKUP_FORMAT) return { ok: false, error: 'too-new' }
  if (!file.data && !file.encrypted) return { ok: false, error: 'damaged' }
  return { ok: true, file }
}

export type OpenedBackup = { ok: true; data: BackupData; createdAt: Date; schemaVersion: number } | { ok: false; error: BackupError; detail?: string }

/** Расшифровать (если нужно), проверить целостность, дополнить до текущей версии и проверить данные. */
export async function openBackup(file: BackupFile, password?: string): Promise<OpenedBackup> {
  let data: unknown
  let checksum: unknown
  if (file.encrypted) {
    if (!password) return { ok: false, error: 'need-password' }
    const e = file.encrypted
    let plain: ArrayBuffer
    try {
      const key = await keyFromPassword(password, fromB64(e.salt), e.iterations)
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(e.iv) }, key, fromB64(e.ciphertext))
    } catch {
      return { ok: false, error: 'wrong-password' }
    }
    try {
      ;({ data, checksum } = JSON.parse(new TextDecoder().decode(plain)))
    } catch {
      return { ok: false, error: 'damaged' }
    }
  } else {
    data = file.data
    checksum = file.checksum
  }
  if (!data || typeof data !== 'object' || typeof checksum !== 'string') return { ok: false, error: 'damaged' }
  if ((await checksumOf(data as BackupData)) !== checksum) return { ok: false, error: 'damaged' }

  const migrated = migrateBackup(data as Partial<BackupData>, file.schemaVersion)
  const problem = validateData(migrated)
  if (problem) return { ok: false, error: 'damaged', detail: problem }
  return { ok: true, data: migrated, createdAt: new Date(file.createdAt), schemaVersion: file.schemaVersion }
}

/**
 * Миграции копий старых версий. Изменения базы v1→v5 только добавляли таблицы и
 * необязательные поля — старой копии достаточно добавить пустые новые таблицы; v6 добавила категории.
 * Если в будущей версии понадобится переделать данные — шаг добавляется здесь.
 */
export function migrateBackup(data: Partial<BackupData>, fromVersion: number): BackupData {
  const out = { ...data } as BackupData
  for (const t of TABLES) {
    if (TABLE_SINCE[t] > fromVersion || out[t] === undefined) out[t] = (out[t] ?? []) as never
  }
  // v6: новые стартовые категории «Кредиты» и «ЖКХ» — как и при обновлении базы
  if (fromVersion < 6 && Array.isArray(out.categories)) out.categories = withNewSeedCategories(out.categories)
  return out
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Проверка смысла данных. Возвращает описание первой проблемы или null. */
export function validateData(d: BackupData): string | null {
  for (const t of TABLES) {
    if (!Array.isArray(d[t])) return `нет таблицы ${t}`
    if (d[t].some((r) => !r || typeof r !== 'object')) return `испорчена таблица ${t}`
    const keyName = t === 'meta' ? 'key' : t === 'closings' ? 'month' : 'id'
    const keys = new Set<string>()
    for (const r of d[t] as unknown as Record<string, unknown>[]) {
      const k = r[keyName]
      if (!isStr(k)) return `запись без ключа в ${t}`
      if (keys.has(k)) return `повтор записи в ${t}`
      keys.add(k)
    }
  }
  if (d.accounts.length === 0) return 'в копии нет ни одного счёта'
  const accounts = new Set(d.accounts.map((a) => a.id))
  for (const a of d.accounts) if (!isStr(a.name) || !isInt(a.initialBalance)) return 'испорчен счёт'
  for (const c of d.categories) if (!isStr(c.name) || (c.kind !== 'expense' && c.kind !== 'income')) return 'испорчена категория'
  for (const t of d.transactions) {
    if (!['expense', 'income', 'transfer'].includes(t.type) || !isInt(t.amount) || t.amount <= 0 || !DATE.test(t.date)) return 'испорчена операция'
    if (!accounts.has(t.accountId)) return 'операция ссылается на несуществующий счёт'
    if (t.type === 'transfer' && (!t.toAccountId || !accounts.has(t.toAccountId))) return 'перевод ссылается на несуществующий счёт'
  }
  for (const m of d.goalMoves) if (!isInt(m.amount) || !DATE.test(m.date)) return 'испорчено движение по копилке'
  return null
}

export type BackupSummary = { accounts: number; transactions: number; goals: number; subscriptions: number }

export function summarize(d: BackupData): BackupSummary {
  return { accounts: d.accounts.length, transactions: d.transactions.length, goals: d.goals.length, subscriptions: d.subscriptions.length }
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `quidly-kopiya_${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`
}

// ---------- напоминание раз в неделю ----------

export const BACKUP_EVERY_DAYS = 7
const DAY = 86_400_000

/**
 * Пора ли напомнить о копии. null — не пора.
 * Иначе — сколько дней прошло с последней копии (null — копий ещё не было).
 * Если копий не было — напоминаем через неделю после начала учёта и только если есть операции.
 */
export function backupReminder(p: {
  now: number
  lastBackupAt: number | null
  snoozeUntil: number | null
  firstUseAt: number | null
  hasTransactions: boolean
}): { daysSince: number | null } | null {
  if (!p.hasTransactions) return null
  if (p.snoozeUntil && p.snoozeUntil > p.now) return null
  const base = p.lastBackupAt ?? p.firstUseAt
  if (base === null) return null
  if (p.now - base < BACKUP_EVERY_DAYS * DAY) return null
  return { daysSince: p.lastBackupAt === null ? null : Math.floor((p.now - p.lastBackupAt) / DAY) }
}

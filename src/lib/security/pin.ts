import { equalBytes, fromB64, randomBytes, toB64 } from './bytes'

/**
 * PIN-код хранится только как «отпечаток» (хеш) — сам PIN нигде не записывается.
 * PBKDF2: PIN + случайная «соль» прогоняются через SHA-256 много раз,
 * так что подбирать PIN по сохранённому хешу долго.
 *
 * Важно: PIN — это замок экрана, а не шифрование данных.
 */

export const PIN_ITERATIONS = 300_000
export const PIN_MIN = 4
export const PIN_MAX = 6

export interface PinRecord {
  /** соль, base64 */
  salt: string
  /** хеш, base64 */
  hash: string
  iterations: number
  /** длина PIN — чтобы экран блокировки проверял сразу после последней цифры */
  length: number
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin)
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPin(pin: string, iterations = PIN_ITERATIONS): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error(`PIN — от ${PIN_MIN} до ${PIN_MAX} цифр`)
  const salt = randomBytes(16)
  const hash = await derive(pin, salt, iterations)
  return { salt: toB64(salt), hash: toB64(hash), iterations, length: pin.length }
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false
  const hash = await derive(pin, fromB64(record.salt), record.iterations)
  return equalBytes(hash, fromB64(record.hash))
}

// ---------- защита от подбора ----------

export interface PinFails {
  count: number
  /** до какого момента (мс) ввод заблокирован */
  until?: number
}

/**
 * Пауза после неудачных попыток: 5 ошибок подряд — 30 секунд,
 * 10 — 5 минут, 15 и больше — 15 минут после каждых следующих пяти.
 */
export function pauseAfter(count: number): number {
  if (count < 5 || count % 5 !== 0) return 0
  if (count === 5) return 30_000
  if (count === 10) return 5 * 60_000
  return 15 * 60_000
}

export function registerFail(prev: PinFails | undefined, now: number): PinFails {
  const count = (prev?.count ?? 0) + 1
  const pause = pauseAfter(count)
  return pause ? { count, until: now + pause } : { count }
}

/** Сколько ещё ошибок до паузы. */
export function attemptsLeft(fails: PinFails | undefined): number {
  const c = fails?.count ?? 0
  return 5 - (c % 5)
}

// ---------- автоблокировка ----------

/** Варианты «блокировать через», в секундах. */
export const LOCK_TIMEOUTS = [0, 60, 300, 900] as const
export const DEFAULT_LOCK_TIMEOUT = 60

export function lockTimeoutLabel(sec: number): string {
  if (sec === 0) return 'Сразу'
  return `Через ${sec / 60} мин`
}

/** Нужно ли заблокировать при возвращении в приложение. */
export function shouldLock(hiddenAt: number | undefined, now: number, timeoutSec: number): boolean {
  if (hiddenAt === undefined) return false
  return now - hiddenAt >= timeoutSec * 1000
}

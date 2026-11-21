import type { BiometricRecord } from '../lib/security/biometric'
import { hashPin, registerFail, verifyPin, type PinFails, type PinRecord } from '../lib/security/pin'
import { db } from './db'
import { getMeta, META, setMeta } from './repo'

// PIN-код, вход по отпечатку и автоблокировка (этап 8).

export async function getPinRecord(): Promise<PinRecord | undefined> {
  return getMeta<PinRecord>(META.pin)
}

export async function setPin(pin: string, iterations?: number): Promise<void> {
  const record = await hashPin(pin, iterations)
  await db.transaction('rw', db.meta, async () => {
    await db.meta.put({ key: META.pin, value: record })
    await db.meta.delete(META.pinFails)
  })
}

/** Выключить PIN — вместе с ним выключается и вход по отпечатку. */
export async function removePin(): Promise<void> {
  await db.meta.bulkDelete([META.pin, META.pinFails, META.biometric])
}

export type PinCheck = { ok: true } | { ok: false; fails: PinFails } | { ok: false; blockedUntil: number }

/** Проверка PIN с учётом паузы после ошибок. */
export async function checkPin(pin: string, now = Date.now()): Promise<PinCheck> {
  const record = await getPinRecord()
  if (!record) return { ok: true }
  const fails = await getMeta<PinFails>(META.pinFails)
  if (fails?.until && fails.until > now) return { ok: false, blockedUntil: fails.until }
  if (await verifyPin(pin, record)) {
    await db.meta.delete(META.pinFails)
    return { ok: true }
  }
  const next = registerFail(fails, now)
  await setMeta(META.pinFails, next)
  return next.until ? { ok: false, blockedUntil: next.until } : { ok: false, fails: next }
}

/** Успешный вход по отпечатку тоже обнуляет счётчик ошибок. */
export async function resetPinFails(): Promise<void> {
  await db.meta.delete(META.pinFails)
}

export async function setLockTimeout(sec: number): Promise<void> {
  await setMeta(META.lockTimeout, sec)
}

export async function setBiometric(record: BiometricRecord | undefined): Promise<void> {
  if (record) await setMeta(META.biometric, record)
  else await db.meta.delete(META.biometric)
}

/**
 * Удалить ВСЕ данные на этом телефоне (сброс забытого PIN).
 * После этого приложение нужно перезапустить — откроется знакомство,
 * где можно восстановить данные из резервной копии.
 */
export async function wipeAllData(): Promise<void> {
  db.close()
  await db.delete()
}

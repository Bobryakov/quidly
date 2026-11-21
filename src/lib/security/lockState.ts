import { getMeta, META } from '../../db/repo'
import { createStore } from '../store'
import { DEFAULT_LOCK_TIMEOUT, shouldLock, type PinRecord } from './pin'

/**
 * Состояние замка:
 * - checking — смотрим в базе, включён ли PIN (доли секунды при запуске);
 * - off — PIN не включён;
 * - locked — показан экран блокировки;
 * - unlocked — PIN включён, приложение открыто.
 */
export type LockState = 'checking' | 'off' | 'locked' | 'unlocked'

export const lock = createStore<LockState>('checking')

let timeoutSec = DEFAULT_LOCK_TIMEOUT
let hiddenAt: number | undefined

/** При запуске: если PIN включён — приложение открывается закрытым. */
export async function initLock(): Promise<void> {
  const [pin, timeout] = await Promise.all([getMeta<PinRecord>(META.pin), getMeta<number>(META.lockTimeout)])
  timeoutSec = timeout ?? DEFAULT_LOCK_TIMEOUT
  lock.set(pin ? 'locked' : 'off')
}

export function unlockApp() {
  lock.set('unlocked')
}

export function lockApp() {
  if (lock.get() === 'unlocked') lock.set('locked')
}

/** PIN только что включили или выключили в настройках. */
export function pinChanged(enabled: boolean) {
  lock.set(enabled ? 'unlocked' : 'off')
}

export function lockTimeoutChanged(sec: number) {
  timeoutSec = sec
}

/** Приложение ушло в фон или вернулось. */
export function onVisibility(hidden: boolean, now = Date.now()) {
  if (lock.get() !== 'unlocked') return
  if (hidden) {
    hiddenAt = now
    // «Сразу» — закрываем ещё в фоне, чтобы при возвращении данные не мелькнули
    if (timeoutSec === 0) lockApp()
    return
  }
  if (shouldLock(hiddenAt, now, timeoutSec)) lockApp()
  hiddenAt = undefined
}

/** Следить за уходом в фон. Возвращает функцию «перестать следить». */
export function watchVisibility(): () => void {
  const handler = () => onVisibility(document.visibilityState === 'hidden')
  document.addEventListener('visibilitychange', handler)
  return () => document.removeEventListener('visibilitychange', handler)
}

/** Только для тестов. */
export function resetLockForTests() {
  lock.set('checking')
  timeoutSec = DEFAULT_LOCK_TIMEOUT
  hiddenAt = undefined
}

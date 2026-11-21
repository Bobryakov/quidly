import { useEffect, useState, type ReactNode } from 'react'
import { initLock, lock, watchVisibility } from '../lib/security/lockState'
import { LockScreen } from './LockScreen'

/**
 * Замок поверх всего приложения. Пока приложение ни разу не открыли PIN-ом,
 * экраны с данными даже не рисуются. При повторной блокировке (ушли в фон)
 * экраны остаются под замком — недописанная трата не потеряется.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const state = lock.use()
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    void initLock()
    return watchVisibility()
  }, [])

  useEffect(() => {
    if (state === 'off' || state === 'unlocked') setOpened(true)
  }, [state])

  if (state === 'checking') return null
  const showApp = opened || state === 'off' || state === 'unlocked'
  return (
    <>
      {showApp && children}
      {state === 'locked' && <LockScreen />}
    </>
  )
}

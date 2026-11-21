import { useEffect, useRef, useState } from 'react'
import { getMeta, META } from '../db/repo'
import { checkPin, resetPinFails, wipeAllData } from '../db/securityRepo'
import { useBackupInfo, useSecurity } from '../db/hooks'
import { verifyBiometric } from '../lib/security/biometric'
import { unlockApp } from '../lib/security/lockState'
import { attemptsLeft, type PinFails } from '../lib/security/pin'
import { formatDate } from '../lib/format'
import { appControl } from '../lib/reload'
import { PinDots, PinPad } from './PinPad'
import { CloseButton, Sheet } from './Sheet'

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Экран блокировки: PIN или отпечаток. */
export function LockScreen() {
  const sec = useSecurity()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [forgot, setForgot] = useState(false)
  const triedBio = useRef(false)

  // Если пауза после ошибок ещё идёт (например, приложение перезапустили) — показываем её
  useEffect(() => {
    void getMeta<PinFails>(META.pinFails).then((f) => {
      if (f?.until && f.until > Date.now()) setBlockedUntil(f.until)
    })
  }, [])

  const blocked = blockedUntil !== null && blockedUntil > now
  useEffect(() => {
    if (blockedUntil === null) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [blockedUntil])

  const bio = async () => {
    if (!sec?.biometric) return
    try {
      if (await verifyBiometric(sec.biometric)) {
        await resetPinFails()
        unlockApp()
      } else setError('Не получилось — введите PIN')
    } catch {
      // человек нажал «Отмена» или телефон не смог — остаётся PIN
    }
  }

  // Сразу предлагаем отпечаток, если он включён
  useEffect(() => {
    if (sec?.biometric && !triedBio.current) {
      triedBio.current = true
      void bio()
    }
  }, [sec?.biometric])

  if (!sec) return <div className="fixed inset-0 z-[100] bg-violet-600" />

  const submit = async (value: string) => {
    setBusy(true)
    const r = await checkPin(value)
    setBusy(false)
    setPin('')
    if (r.ok) return unlockApp()
    setShake((s) => s + 1)
    if ('blockedUntil' in r) {
      setNow(Date.now())
      setBlockedUntil(r.blockedUntil)
      setError('')
    } else {
      const left = attemptsLeft(r.fails)
      setError(`Неверный PIN. До паузы ${left === 1 ? 'осталась 1 попытка' : `осталось попыток: ${left}`}`)
    }
  }

  const onDigit = (d: string) => {
    if (busy || blocked) return
    setError('')
    const next = (pin + d).slice(0, sec.pinLength)
    setPin(next)
    if (next.length === sec.pinLength) void submit(next)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quidly заблокирован"
      className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-500 px-6 text-white"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 48px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
    >
      <div className="text-5xl" aria-hidden>
        🔒
      </div>
      <h1 className="mt-3 text-2xl font-extrabold">Введите PIN</h1>
      <div className="mt-6">
        <PinDots filled={pin.length} total={sec.pinLength} shake={shake} onColor />
      </div>
      <p className="mt-4 min-h-12 text-center text-sm" role="alert">
        {blocked ? (
          <>
            Слишком много ошибок. Попробуйте через <b className="tabular">{mmss(blockedUntil! - now)}</b>
          </>
        ) : (
          error
        )}
      </p>
      <div className="mt-2 w-full max-w-xs">
        <PinPad onDigit={onDigit} onBack={() => setPin(pin.slice(0, -1))} onBiometric={sec.biometric ? bio : undefined} disabled={busy || blocked} onColor />
      </div>
      <button type="button" onClick={() => setForgot(true)} className="mt-6 py-2 text-sm font-medium underline underline-offset-4 opacity-90">
        Забыли PIN?
      </button>

      <ForgotPinSheet open={forgot} onClose={() => setForgot(false)} />
    </div>
  )
}

/** «Забыли PIN?»: восстановить нельзя — только стереть данные и вернуть их из резервной копии. */
function ForgotPinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const backup = useBackupInfo()
  const [step, setStep] = useState<1 | 2>(1)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setStep(1)
    setWord('')
    onClose()
  }

  const wipe = async () => {
    setBusy(true)
    await wipeAllData()
    appControl.reload()
  }

  return (
    <Sheet open={open} onClose={close} label="Забыли PIN">
      <div className="text-slate-800 dark:text-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Забыли PIN?</h2>
          <CloseButton onClick={close} />
        </div>
        {step === 1 ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              PIN нигде не хранится в открытом виде, поэтому подсказать его нельзя. Сбросить PIN можно только вместе со{' '}
              <b>всеми данными Quidly на этом телефоне</b>. Потом их можно вернуть из резервной копии.
            </p>
            <p className="mt-3 rounded-2xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              💾 {backup?.lastBackupAt ? <>Последняя резервная копия: <b>{formatDate(new Date(backup.lastBackupAt))}</b></> : 'Резервную копию на этом телефоне ещё не сохраняли.'}
            </p>
            <button type="button" onClick={close} className="mt-4 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
              Я вспомню, вернуться
            </button>
            <button type="button" onClick={() => setStep(2)} className="mt-2 w-full rounded-2xl py-3 font-semibold text-rose-600 dark:text-rose-400">
              Сбросить PIN и удалить данные
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Будут удалены все счета, операции, бюджеты, подписки и копилки. Отменить это нельзя. Чтобы подтвердить, напишите{' '}
              <b>УДАЛИТЬ</b>.
            </p>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              aria-label="Слово для подтверждения"
              autoCapitalize="characters"
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-lg dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              type="button"
              disabled={word.trim().toUpperCase() !== 'УДАЛИТЬ' || busy}
              onClick={wipe}
              className="mt-4 w-full rounded-2xl bg-rose-600 py-3.5 font-semibold text-white disabled:opacity-40"
            >
              Удалить все данные
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}

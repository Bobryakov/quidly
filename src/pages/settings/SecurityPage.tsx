import { useEffect, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { PinDots, PinPad } from '../../components/PinPad'
import { CloseButton, Sheet } from '../../components/Sheet'
import { useSecurity } from '../../db/hooks'
import { checkPin, removePin, resetPinFails, setBiometric, setLockTimeout, setPin } from '../../db/securityRepo'
import { biometricAvailable, registerBiometric, verifyBiometric, type BiometricRecord } from '../../lib/security/biometric'
import { lockApp, lockTimeoutChanged, pinChanged } from '../../lib/security/lockState'
import { LOCK_TIMEOUTS, lockTimeoutLabel, PIN_MAX, PIN_MIN } from '../../lib/security/pin'
import { showToast } from '../../lib/store'
import { BackLink } from './AccountsPage'

type Mode = 'create' | 'change' | 'disable'

/** «Настройки → PIN и блокировка». */
export function SecurityPage() {
  const sec = useSecurity()
  const [mode, setMode] = useState<Mode | null>(null)
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    void biometricAvailable().then(setBioAvailable)
  }, [])

  if (!sec) return null

  const toggleBio = async (on: boolean) => {
    if (!on) {
      await setBiometric(undefined)
      return showToast('Вход по отпечатку выключен')
    }
    try {
      await setBiometric(await registerBiometric())
      showToast('Готово: теперь можно входить по отпечатку или лицу')
    } catch (e) {
      if ((e as Error).name !== 'NotAllowedError') showToast((e as Error).message || 'Не получилось подключить отпечаток')
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader title="PIN и блокировка" />

      <p className="mb-4 rounded-3xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        ℹ️ <b>PIN — это замок экрана, а не шифрование.</b> Посторонний не откроет Quidly, но сами данные на телефоне не
        зашифрованы. Поэтому не забывайте и про блокировку самого телефона.
      </p>

      {!sec.pinEnabled ? (
        <section className="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
          <h2 className="font-semibold">🔒 PIN-код выключен</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Сейчас Quidly открывается сразу. С PIN-кодом — только после ввода {PIN_MIN}–{PIN_MAX} цифр или отпечатка.
          </p>
          <button type="button" onClick={() => setMode('create')} className="mt-4 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
            Включить PIN
          </button>
        </section>
      ) : (
        <>
          <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
            <h2 className="font-semibold">✅ PIN-код включён</h2>
            <label className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                checked={!!sec.biometric}
                disabled={!bioAvailable && !sec.biometric}
                onChange={(e) => void toggleBio(e.target.checked)}
                className="mt-1 h-5 w-5 accent-violet-600"
              />
              <span>
                <span className="block font-medium">👆 Вход по отпечатку или лицу</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {bioAvailable === false && !sec.biometric
                    ? 'На этом телефоне или в этом браузере недоступно.'
                    : 'Телефон спросит отпечаток (или лицо). PIN остаётся запасным способом.'}
                </span>
              </span>
            </label>
          </section>

          <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
            <h2 className="font-semibold">Блокировать после выхода из приложения</h2>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Блокировать после выхода">
              {LOCK_TIMEOUTS.map((t) => {
                const active = sec.lockTimeout === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      lockTimeoutChanged(t)
                      void setLockTimeout(t)
                    }}
                    className={`rounded-2xl border-2 px-3 py-2.5 text-sm font-medium ${
                      active
                        ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                        : 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {lockTimeoutLabel(t)}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">При каждом новом запуске Quidly PIN спрашивается всегда.</p>
          </section>

          <section className="rounded-3xl bg-white px-5 py-1 shadow-sm dark:bg-slate-900">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              <li>
                <button type="button" onClick={lockApp} className="w-full py-3.5 text-left font-medium">
                  🔒 Заблокировать сейчас
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setMode('change')} className="w-full py-3.5 text-left font-medium">
                  🔢 Сменить PIN
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setMode('disable')} className="w-full py-3.5 text-left font-medium text-rose-600 dark:text-rose-400">
                  Выключить PIN
                </button>
              </li>
            </ul>
          </section>
        </>
      )}

      <Sheet open={mode !== null} onClose={() => setMode(null)} label="PIN-код">
        {mode && (
          <PinFlow
            key={mode}
            mode={mode}
            pinLength={sec.pinLength}
            biometric={sec.biometric}
            offerBiometric={!!bioAvailable && !sec.biometric}
            onDone={() => setMode(null)}
          />
        )}
      </Sheet>
    </>
  )
}

type Step = 'current' | 'new' | 'repeat' | 'bio'

const TITLES: Record<Step, string> = {
  current: 'Введите текущий PIN',
  new: 'Придумайте PIN',
  repeat: 'Повторите PIN',
  bio: 'Входить по отпечатку?',
}

/** Включение, смена и выключение PIN: «текущий → новый → ещё раз». */
function PinFlow({
  mode,
  pinLength,
  biometric,
  offerBiometric,
  onDone,
}: {
  mode: Mode
  pinLength: number
  biometric: BiometricRecord | null
  offerBiometric: boolean
  onDone: () => void
}) {
  const [step, setStep] = useState<Step>(mode === 'create' ? 'new' : 'current')
  const [value, setValue] = useState('')
  const [first, setFirst] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)

  const fail = (msg: string) => {
    setError(msg)
    setShake((s) => s + 1)
    setValue('')
  }

  const currentOk = async () => {
    if (mode === 'disable') {
      await removePin()
      pinChanged(false)
      showToast('PIN выключен')
      return onDone()
    }
    setValue('')
    setStep('new')
  }

  const checkCurrent = async (v: string) => {
    setBusy(true)
    const r = await checkPin(v)
    setBusy(false)
    if (r.ok) return currentOk()
    if ('blockedUntil' in r) return fail('Слишком много ошибок — попробуйте позже')
    fail('Неверный PIN')
  }

  const save = async (v: string) => {
    if (v !== first) {
      setStep('new')
      setFirst('')
      return fail('PIN не совпал — придумайте ещё раз')
    }
    setBusy(true)
    await setPin(v)
    setBusy(false)
    pinChanged(true)
    showToast(mode === 'create' ? 'PIN включён 🔒' : 'PIN изменён')
    if (mode === 'create' && offerBiometric) {
      setValue('')
      setStep('bio')
    } else onDone()
  }

  const next = () => {
    setFirst(value)
    setValue('')
    setError('')
    setStep('repeat')
  }

  const onDigit = (d: string) => {
    if (busy) return
    setError('')
    if (step === 'current') {
      const v = (value + d).slice(0, pinLength)
      setValue(v)
      if (v.length === pinLength) void checkCurrent(v)
    } else if (step === 'new') {
      const v = (value + d).slice(0, PIN_MAX)
      setValue(v)
    } else if (step === 'repeat') {
      const v = (value + d).slice(0, first.length)
      setValue(v)
      if (v.length === first.length) void save(v)
    }
  }

  const bioConfirm = async () => {
    if (!biometric) return
    try {
      if (await verifyBiometric(biometric)) {
        await resetPinFails()
        await currentOk()
      }
    } catch {
      // отмена — остаётся ввод PIN
    }
  }

  const enableBio = async () => {
    try {
      await setBiometric(await registerBiometric())
      showToast('Готово: теперь можно входить по отпечатку или лицу')
    } catch (e) {
      if ((e as Error).name !== 'NotAllowedError') showToast((e as Error).message || 'Не получилось подключить отпечаток')
    }
    onDone()
  }

  const dots = step === 'current' ? pinLength : step === 'repeat' ? first.length : PIN_MAX

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-bold">{mode === 'disable' && step === 'current' ? 'Выключить PIN' : TITLES[step]}</h2>
        <CloseButton onClick={onDone} />
      </div>

      {step === 'bio' ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Можно открывать Quidly отпечатком пальца или лицом — так быстрее. PIN останется запасным способом.
          </p>
          <button type="button" onClick={enableBio} className="mt-4 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
            👆 Да, по отпечатку
          </button>
          <button type="button" onClick={onDone} className="mt-2 w-full rounded-2xl py-3 font-semibold text-slate-500">
            Не сейчас
          </button>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {step === 'new' ? `От ${PIN_MIN} до ${PIN_MAX} цифр. Не используйте дату рождения и 1234.` : ' '}
          </p>
          <PinDots filled={value.length} total={dots} shake={shake} />
          <p className="mt-3 min-h-6 text-center text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
          <div className="mt-2">
            <PinPad
              onDigit={onDigit}
              onBack={() => setValue(value.slice(0, -1))}
              onBiometric={step === 'current' && biometric ? bioConfirm : undefined}
              disabled={busy}
            />
          </div>
          {step === 'new' && (
            <button
              type="button"
              disabled={value.length < PIN_MIN}
              onClick={next}
              className="mt-4 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white disabled:opacity-40"
            >
              Далее
            </button>
          )}
        </>
      )}
    </div>
  )
}

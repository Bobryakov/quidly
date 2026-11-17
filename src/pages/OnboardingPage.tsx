import { motion } from 'framer-motion'
import { useState } from 'react'
import { finishOnboarding } from '../db/repo'
import { ACCOUNT_TYPES } from '../db/seed'
import type { AccountType } from '../db/types'
import { parseAmount } from '../lib/amount'

type Row = { key: number; name: string; type: AccountType; balance: string }

const COLOR: Record<AccountType, string> = { card: '#3b82f6', cash: '#22c55e', deposit: '#a855f7' }

/** Первый запуск: «Сколько у вас сейчас денег?» — заводим счета с текущими остатками. */
export function OnboardingPage() {
  const [rows, setRows] = useState<Row[]>([
    { key: 1, name: 'Карта', type: 'card', balance: '' },
    { key: 2, name: 'Наличные', type: 'cash', balance: '' },
  ])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key: number, patch: Partial<Row>) => {
    setError('')
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const start = async () => {
    const filled = rows.filter((r) => r.name.trim())
    if (filled.length === 0) return setError('Нужен хотя бы один счёт')
    const parsed = filled.map((r) => ({ r, kop: parseAmount(r.balance) }))
    const bad = parsed.find((p) => p.kop === null)
    if (bad) return setError(`Не получается прочитать сумму у «${bad.r.name}». Пример: 12 345,67`)
    setSaving(true)
    try {
      await finishOnboarding(
        parsed.map(({ r, kop }) => ({
          name: r.name,
          type: r.type,
          emoji: ACCOUNT_TYPES[r.type].emoji,
          color: COLOR[r.type],
          initialBalance: kop!,
        })),
      )
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-10 pb-8"
    >
      <div className="mb-2 text-6xl" aria-hidden>
        👋
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">Привет! Это Quidly</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">
        Сколько у вас сейчас денег? Впишите остатки — с них начнётся учёт. Можно оставить пустыми и поправить потом в
        настройках.
      </p>

      <div className="mt-6 space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <select
                value={r.type}
                onChange={(e) => set(r.key, { type: e.target.value as AccountType })}
                aria-label="Тип счёта"
                className="rounded-xl bg-slate-100 px-2 py-2 text-xl dark:bg-slate-800"
              >
                {Object.entries(ACCOUNT_TYPES).map(([value, t]) => (
                  <option key={value} value={value}>
                    {t.emoji} {t.label}
                  </option>
                ))}
              </select>
              <input
                value={r.name}
                onChange={(e) => set(r.key, { name: e.target.value })}
                aria-label="Название счёта"
                placeholder="Название"
                className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 font-medium dark:bg-slate-800"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={`Убрать ${r.name || 'счёт'}`}
                  onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                  className="h-9 w-9 shrink-0 rounded-full text-slate-400"
                >
                  ✕
                </button>
              )}
            </div>
            <label className="mt-3 flex items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400">Сейчас на счёте</span>
              <input
                value={r.balance}
                onChange={(e) => set(r.key, { balance: e.target.value })}
                inputMode="decimal"
                placeholder="0"
                aria-label={`Остаток: ${r.name}`}
                className="tabular min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 text-right text-lg font-semibold dark:bg-slate-800"
              />
              <span className="text-lg font-semibold text-slate-400">₽</span>
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setRows([...rows, { key: Math.max(0, ...rows.map((r) => r.key)) + 1, name: '', type: 'card', balance: '' }])
        }
        className="mt-3 rounded-2xl border-2 border-dashed border-violet-200 py-3 font-medium text-violet-600 dark:border-violet-500/30 dark:text-violet-300"
      >
        + Ещё счёт
      </button>

      <p className="mt-4 h-5 text-sm font-medium text-rose-500" role="alert">
        {error}
      </p>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={start}
          disabled={saving}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 py-4 text-lg font-bold text-white shadow-lg shadow-pink-500/25 disabled:opacity-60"
        >
          Начать 🚀
        </button>
        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
          🔐 Данные хранятся только на этом устройстве
        </p>
      </div>
    </motion.main>
  )
}

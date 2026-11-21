import { useMemo, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { useAccounts, useCategories, useTransactions } from '../../db/hooks'
import { isoToRu, todayISO } from '../../lib/dates'
import { exportFileName, exportRows, MIME, PERIOD_PRESETS, presetRange, toCsv, toXlsx, type PeriodPreset } from '../../lib/export'
import { canShareFile, downloadFile, shareFile } from '../../lib/fileSave'
import { opsWord } from '../../lib/format'
import { showToast } from '../../lib/store'
import { BackLink } from './AccountsPage'

type Format = 'xlsx' | 'csv'

const chip = (active: boolean) =>
  `rounded-2xl border-2 px-3 py-2.5 text-sm font-medium ${
    active
      ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
      : 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }`

/** «Настройки → Экспорт операций» — таблица для Excel или Google Таблиц. */
export default function ExportPage() {
  const transactions = useTransactions()
  const accounts = useAccounts()
  const categories = useCategories()
  const today = todayISO()
  const [preset, setPreset] = useState<PeriodPreset>('month')
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today })
  const [format, setFormat] = useState<Format>('xlsx')
  const [busy, setBusy] = useState(false)

  const range = useMemo(
    () => (preset === 'custom' ? custom : presetRange(preset, today, transactions ?? [])),
    [preset, custom, today, transactions],
  )
  const rows = useMemo(
    () => (transactions && accounts && categories ? exportRows(transactions, accounts, categories, range.from, range.to) : []),
    [transactions, accounts, categories, range],
  )

  if (!transactions || !accounts || !categories) return null

  const badRange = range.from > range.to
  const name = exportFileName(range.from, range.to, format)
  const mime = MIME[format]

  const make = async () => (format === 'csv' ? toCsv(rows) : await toXlsx(rows))

  const download = async () => {
    setBusy(true)
    try {
      downloadFile(await make(), name, mime)
      showToast('Файл сохранён в «Загрузки»')
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    setBusy(true)
    try {
      await shareFile(await make(), name, mime)
    } catch {
      showToast('Не получилось поделиться — сохраните файл кнопкой «Скачать»')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader title="Экспорт операций" />
      <p className="-mt-2 mb-4 text-sm text-slate-500 dark:text-slate-400">
        Таблица со всеми операциями за период — откроется в Excel или Google Таблицах.
      </p>

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">Период</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Период">
          {PERIOD_PRESETS.map((p) => (
            <button key={p.value} type="button" role="radio" aria-checked={preset === p.value} onClick={() => setPreset(p.value)} className={chip(preset === p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-500 dark:text-slate-400">С</span>
              <input
                type="date"
                value={custom.from}
                onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-500 dark:text-slate-400">По</span>
              <input
                type="date"
                value={custom.to}
                onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            {isoToRu(range.from)} — {isoToRu(range.to)}
          </p>
        )}
      </section>

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">Формат</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Формат файла">
          <button type="button" role="radio" aria-checked={format === 'xlsx'} onClick={() => setFormat('xlsx')} className={chip(format === 'xlsx')}>
            Excel (.xlsx)
          </button>
          <button type="button" role="radio" aria-checked={format === 'csv'} onClick={() => setFormat('csv')} className={chip(format === 'csv')}>
            CSV
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {format === 'xlsx' ? 'Таблица Excel: даты и суммы — настоящие, их можно сразу сортировать и считать формулами.' : 'Простой текстовый файл — подходит почти любой программе.'}
        </p>
      </section>

      <p className="mb-3 text-center font-medium" aria-live="polite">
        {badRange ? 'Дата «с» позже даты «по»' : rows.length === 0 ? 'За этот период операций нет' : `Будет выгружено: ${opsWord(rows.length)}`}
      </p>
      <button
        type="button"
        disabled={busy || badRange || rows.length === 0}
        onClick={download}
        className="w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        ⤓ Скачать файл
      </button>
      {canShareFile(name, mime) && (
        <button
          type="button"
          disabled={busy || badRange || rows.length === 0}
          onClick={share}
          className="mt-2 w-full rounded-2xl bg-slate-100 py-3.5 font-semibold text-slate-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200"
        >
          Поделиться…
        </button>
      )}
    </>
  )
}

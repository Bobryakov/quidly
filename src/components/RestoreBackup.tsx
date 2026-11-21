import { useState } from 'react'
import { SCHEMA_VERSION } from '../db/db'
import { makeBackupText, markBackupSaved, restoreBackupData } from '../db/backupRepo'
import { autoCloseMonths } from '../db/repo'
import { BACKUP_ERROR_TEXT, backupFileName, openBackup, parseBackup, summarize, type BackupData, type BackupFile } from '../lib/backup'
import { todayISO } from '../lib/dates'
import { downloadFile } from '../lib/fileSave'
import { formatDate, plural } from '../lib/format'
import { MIME } from '../lib/export'
import { showToast } from '../lib/store'

type Stage = { s: 'pick' } | { s: 'password'; file: BackupFile } | { s: 'confirm'; data: BackupData; createdAt: Date }

const inputCls = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800'

function dateTime(d: Date): string {
  return `${formatDate(d)} в ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Восстановление из файла копии: выбрать файл → (пароль) → что в копии → подтвердить. */
export function RestoreBackup({ hasCurrentData, onDone }: { hasCurrentData: boolean; onDone?: () => void }) {
  const [stage, setStage] = useState<Stage>({ s: 'pick' })
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setStage({ s: 'pick' })
    setError('')
    setPassword('')
  }

  const open = async (file: BackupFile, pass?: string) => {
    setBusy(true)
    const r = await openBackup(file, pass)
    setBusy(false)
    if (r.ok) {
      setError('')
      return setStage({ s: 'confirm', data: r.data, createdAt: r.createdAt })
    }
    if (r.error === 'need-password') return setStage({ s: 'password', file })
    setError(BACKUP_ERROR_TEXT[r.error])
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setError('')
    const parsed = parseBackup(await f.text(), SCHEMA_VERSION)
    if (!parsed.ok) return setError(BACKUP_ERROR_TEXT[parsed.error])
    await open(parsed.file)
  }

  const saveCurrent = async () => {
    downloadFile(await makeBackupText(), backupFileName(), MIME.json)
    await markBackupSaved()
    showToast('Копия текущих данных сохранена в «Загрузки»')
  }

  const restore = async (data: BackupData) => {
    setBusy(true)
    try {
      await restoreBackupData(data)
      await autoCloseMonths(todayISO())
      showToast('Данные восстановлены ✅')
      reset()
      onDone?.()
    } catch (e) {
      console.error(e)
      setError('Не получилось восстановить — текущие данные не изменились.')
    } finally {
      setBusy(false)
    }
  }

  if (stage.s === 'confirm') {
    const n = summarize(stage.data)
    return (
      <div>
        <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-800">
          <p className="font-semibold">Копия от {dateTime(stage.createdAt)}</p>
          <ul className="mt-1 text-sm text-slate-600 dark:text-slate-300" aria-label="Что в копии">
            <li>
              {n.accounts} {plural(n.accounts, ['счёт', 'счёта', 'счетов'])}, {n.transactions} {plural(n.transactions, ['операция', 'операции', 'операций'])}
            </li>
            <li>
              {n.goals} {plural(n.goals, ['копилка', 'копилки', 'копилок'])}, {n.subscriptions} {plural(n.subscriptions, ['подписка', 'подписки', 'подписок'])}
            </li>
          </ul>
        </div>
        {hasCurrentData && (
          <>
            <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
              ⚠️ Все текущие данные на этом телефоне будут <b>заменены</b> данными из копии. Отменить это нельзя.
            </p>
            <button type="button" onClick={saveCurrent} className="mt-2 w-full py-2 text-sm font-medium text-violet-600 dark:text-violet-400">
              Сначала сохранить копию текущих данных
            </button>
          </>
        )}
        <p className="mt-2 min-h-5 text-sm text-rose-600" role="alert">
          {error}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void restore(stage.data)}
          className={`mt-1 w-full rounded-2xl py-3.5 font-semibold text-white disabled:opacity-40 ${hasCurrentData ? 'bg-rose-600' : 'bg-violet-600'}`}
        >
          {hasCurrentData ? 'Заменить данные' : 'Восстановить'}
        </button>
        <button type="button" onClick={reset} className="mt-2 w-full py-2.5 font-semibold text-slate-500">
          Отмена
        </button>
      </div>
    )
  }

  if (stage.s === 'password') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void open(stage.file, password)
        }}
      >
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">🔑 Копия защищена паролем.</p>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Пароль копии" autoFocus className={inputCls} />
        <p className="mt-2 min-h-5 text-sm text-rose-600" role="alert">
          {error}
        </p>
        <button type="submit" disabled={busy || !password} className="mt-1 w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white disabled:opacity-40">
          {busy ? 'Проверяю…' : 'Открыть копию'}
        </button>
        <button type="button" onClick={reset} className="mt-2 w-full py-2.5 font-semibold text-slate-500">
          Отмена
        </button>
      </form>
    )
  }

  return (
    <div>
      <label className="block w-full cursor-pointer rounded-2xl border-2 border-dashed border-violet-300 py-4 text-center font-semibold text-violet-600 dark:border-violet-500/40 dark:text-violet-300">
        📂 Выбрать файл копии
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Файл резервной копии"
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      <p className="mt-2 min-h-5 text-sm text-rose-600" role="alert">
        {error}
      </p>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../../components/PageHeader'
import { RestoreBackup } from '../../components/RestoreBackup'
import { makeBackupText, markBackupSaved } from '../../db/backupRepo'
import { useBackupInfo } from '../../db/hooks'
import { backupFileName } from '../../lib/backup'
import { MIME } from '../../lib/export'
import { canShareFile, downloadFile, shareFile } from '../../lib/fileSave'
import { formatDate } from '../../lib/format'
import { showToast } from '../../lib/store'
import { BackLink } from './AccountsPage'

const MIN_PASSWORD = 6
const inputCls = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800'

/** «Настройки → Резервная копия». */
export function BackupPage() {
  const info = useBackupInfo()
  const navigate = useNavigate()
  const [withPassword, setWithPassword] = useState(false)
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!info) return null

  const name = backupFileName()
  const shareable = canShareFile(name, MIME.json)

  const prepare = async (): Promise<string | null> => {
    setError('')
    if (withPassword) {
      if (p1.length < MIN_PASSWORD) {
        setError(`Пароль — не короче ${MIN_PASSWORD} символов`)
        return null
      }
      if (p1 !== p2) {
        setError('Пароли не совпадают')
        return null
      }
    }
    return makeBackupText(withPassword ? p1 : undefined)
  }

  const save = async (how: 'download' | 'share') => {
    setBusy(true)
    try {
      const text = await prepare()
      if (text === null) return
      if (how === 'download') {
        downloadFile(text, name, MIME.json)
      } else if (!(await shareFile(text, name, MIME.json))) return
      await markBackupSaved()
      setP1('')
      setP2('')
      showToast(how === 'download' ? 'Копия сохранена в «Загрузки» ✅' : 'Копия отправлена ✅')
    } catch {
      setError('Не получилось сохранить копию')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader title="Резервная копия" />

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">💾 Сохранить копию</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400" aria-label="Последняя копия">
          {info.lastBackupAt ? (
            <>
              Последняя копия: <b>{formatDate(new Date(info.lastBackupAt))}</b>
            </>
          ) : (
            'Копию на этом телефоне ещё не сохраняли.'
          )}
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Все счета, операции, бюджеты, подписки и копилки — в одном файле. Перенесите его в Google Диск или на компьютер: если
          телефон потеряется, копия на нём не поможет.
        </p>

        <label className="mt-4 flex items-start gap-3">
          <input type="checkbox" checked={withPassword} onChange={(e) => setWithPassword(e.target.checked)} className="mt-1 h-5 w-5 accent-violet-600" />
          <span>
            <span className="block font-medium">🔑 Защитить паролем</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Без пароля файл может прочитать любой, у кого он окажется.</span>
          </span>
        </label>
        {withPassword && (
          <div className="mt-3 space-y-2">
            <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="Пароль" aria-label="Пароль" autoComplete="new-password" className={inputCls} />
            <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Ещё раз" aria-label="Пароль ещё раз" autoComplete="new-password" className={inputCls} />
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              Запишите пароль. Восстановить его нельзя — без него копию никто не откроет, даже вы.
            </p>
          </div>
        )}
        <p className="mt-2 min-h-5 text-sm text-rose-600" role="alert">
          {error}
        </p>
        <button type="button" disabled={busy} onClick={() => void save('download')} className="w-full rounded-2xl bg-violet-600 py-3.5 font-semibold text-white disabled:opacity-40">
          {busy ? 'Готовлю файл…' : '⤓ Сохранить файл'}
        </button>
        {shareable && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save('share')}
            className="mt-2 w-full rounded-2xl bg-slate-100 py-3.5 font-semibold text-slate-700 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200"
          >
            Поделиться…
          </button>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <h2 className="mb-1 font-semibold">♻️ Восстановить из копии</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Например, на новом телефоне. Текущие данные будут заменены.</p>
        <RestoreBackup hasCurrentData onDone={() => navigate('/')} />
      </section>
    </>
  )
}

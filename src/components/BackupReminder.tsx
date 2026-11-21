import { useState } from 'react'
import { Link } from 'react-router'
import { snoozeBackupReminder } from '../db/backupRepo'
import { useBackupInfo } from '../db/hooks'
import type { Account } from '../db/types'
import { backupReminder } from '../lib/backup'
import { plural } from '../lib/format'

/** Плашка на главной: «Пора сохранить резервную копию» — раз в неделю. */
export function BackupReminder({ accounts, hasTransactions }: { accounts: Account[]; hasTransactions: boolean }) {
  const info = useBackupInfo()
  const [now] = useState(() => Date.now())
  if (!info) return null
  const firstUseAt = accounts.length ? Math.min(...accounts.map((a) => a.createdAt)) : null
  const due = backupReminder({ now, lastBackupAt: info.lastBackupAt, snoozeUntil: info.snoozeUntil, firstUseAt, hasTransactions })
  if (!due) return null

  return (
    <section aria-label="Напоминание о резервной копии" className="flex items-start gap-3 rounded-3xl bg-sky-50 p-4 dark:bg-sky-500/10">
      <span className="text-2xl" aria-hidden>
        💾
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Пора сохранить резервную копию</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {due.daysSince === null
            ? 'Вы ещё ни разу её не сохраняли. Если телефон потеряется, данные не вернуть.'
            : `Последняя была ${due.daysSince} ${plural(due.daysSince, ['день', 'дня', 'дней'])} назад.`}
        </p>
        <div className="mt-2 flex gap-2">
          <Link to="/settings/backup" className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Сохранить
          </Link>
          <button type="button" onClick={() => void snoozeBackupReminder()} className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            Завтра
          </button>
        </div>
      </div>
    </section>
  )
}

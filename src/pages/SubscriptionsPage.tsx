import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { EmojiBubble } from '../components/Pickers'
import { CloseButton, Sheet } from '../components/Sheet'
import { useAccounts, useById, useCategories, useLastAccountId, useNoticeDays, useSubscriptions } from '../db/hooks'
import { createSubscription, deleteSubscription, META, setMeta, updateSubscription } from '../db/repo'
import type { Subscription, SubscriptionPeriod } from '../db/types'
import { kopecksToKeypad, parseAmount } from '../lib/amount'
import { shortDayLabel, todayISO } from '../lib/dates'
import { formatMoney, plural } from '../lib/format'
import { showToast } from '../lib/store'
import { daysBetween, monthlyEquivalent, monthlyTotal, NOTICE_DAYS_OPTIONS, PERIODS, relativeDay } from '../lib/subscriptions'
import { askConfirm } from '../components/ConfirmHost'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })
/** Суммы «в пересчёте» — примерные, показываем до рубля */
const approx = (k: number) => formatMoney(Math.round(k / 100) * 100, { hideZeroKopecks: true })
const SUBS_CATEGORY = 'seed-expense-6' // 📺 Подписки — по умолчанию

type Editing = { mode: 'new' } | { mode: 'edit'; sub: Subscription }

export function SubscriptionsPage() {
  const subs = useSubscriptions()
  const categories = useCategories()
  const catById = useById(categories)
  const noticeDays = useNoticeDays()
  const [editing, setEditing] = useState<Editing | null>(null)

  if (!subs || !categories || noticeDays === undefined) return null
  const today = todayISO()
  const active = subs.filter((s) => !s.paused)
  const paused = subs.filter((s) => s.paused)

  const row = (s: Subscription) => {
    const cat = catById.get(s.categoryId)
    const inDays = daysBetween(today, s.nextDate)
    return (
      <button key={s.id} type="button" onClick={() => setEditing({ mode: 'edit', sub: s })} className="flex w-full items-center gap-3 py-3 text-left">
        <EmojiBubble emoji={cat?.emoji ?? '🔁'} color={cat?.color ?? '#0ea5e9'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{s.name}</span>
          <span className={`text-sm ${inDays < 0 && !s.paused ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {s.paused ? 'на паузе' : Math.abs(inDays) <= 2 ? relativeDay(inDays) : `${shortDayLabel(s.nextDate, today).toLowerCase()} · ${relativeDay(inDays)}`}
          </span>
        </span>
        <span className="text-right">
          <span className="tabular block font-semibold">{money(s.amount)}</span>
          <span className="text-xs text-slate-400">{PERIODS[s.period].per}</span>
        </span>
      </button>
    )
  }

  return (
    <>
      <Link to="/settings" className="mb-2 inline-block text-sm font-medium text-violet-600 dark:text-violet-400">
        ‹ Настройки
      </Link>
      <PageHeader title="Подписки" />

      {subs.length > 0 && (
        <section className="mb-4 rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-500 p-5 text-white shadow-lg shadow-sky-500/20">
          <p className="text-sm opacity-90">В пересчёте на месяц</p>
          <p className="tabular text-3xl font-extrabold" aria-label="Подписки в месяц">
            {approx(monthlyTotal(subs))}
          </p>
          <p className="mt-1 text-sm opacity-80">
            {active.length} {plural(active.length, ['активная', 'активные', 'активных'])}{' '}
            {plural(active.length, ['подписка', 'подписки', 'подписок'])} · в год ≈ {approx(monthlyTotal(subs) * 12)}
          </p>
        </section>
      )}

      {subs.length === 0 ? (
        <EmptyState emoji="🔁" title="Подписок пока нет" hint="Добавьте кино, музыку, связь — и Quidly напомнит перед списанием" />
      ) : (
        <section className="rounded-3xl bg-white px-4 py-1 shadow-sm dark:bg-slate-900">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(row)}</div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setEditing({ mode: 'new' })}
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-violet-200 py-3 font-medium text-violet-600 dark:border-violet-500/30 dark:text-violet-300"
      >
        + Добавить подписку
      </button>

      {paused.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 px-1 font-semibold text-slate-500 dark:text-slate-400">На паузе</h2>
          <section className="rounded-3xl bg-white px-4 py-1 opacity-70 shadow-sm dark:bg-slate-900">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">{paused.map(row)}</div>
          </section>
        </>
      )}

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">Напоминать о списании</h2>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="За сколько дней напоминать">
          {NOTICE_DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={noticeDays === d}
              onClick={() => setMeta(META.subscriptionNoticeDays, d)}
              className={`rounded-2xl border-2 py-2 text-sm font-medium ${
                noticeDays === d
                  ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              за {d} {d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}
            </button>
          ))}
        </div>
      </section>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Подписка">
        {editing && (
          <SubscriptionForm key={editing.mode === 'edit' ? editing.sub.id : 'new'} editing={editing} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </>
  )
}

function SubscriptionForm({ editing, onDone }: { editing: Editing; onDone: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const lastAccountId = useLastAccountId()
  const s = editing.mode === 'edit' ? editing.sub : undefined

  const [name, setName] = useState(s?.name ?? '')
  const [amount, setAmount] = useState(s ? kopecksToKeypad(s.amount) : '')
  const [period, setPeriod] = useState<SubscriptionPeriod>(s?.period ?? 'month')
  const [nextDate, setNextDate] = useState(s?.nextDate ?? todayISO())
  const [accountId, setAccountId] = useState<string | undefined>(s?.accountId)
  const [categoryId, setCategoryId] = useState(s?.categoryId ?? SUBS_CATEGORY)
  const [paused, setPaused] = useState(s?.paused ?? false)
  const [error, setError] = useState('')

  if (!accounts || !categories || lastAccountId === undefined) return <div className="h-96" />
  const selectable = accounts.filter((a) => !a.archived || a.id === accountId)
  const chosenAccount = accountId ?? (selectable.find((a) => a.id === lastAccountId) ?? selectable[0])?.id
  const expense = categories.filter((c) => c.kind === 'expense')
  const kop = parseAmount(amount)

  const save = async () => {
    if (kop === null || kop <= 0) return setError('Введите сумму, например 299')
    const input = { name, amount: kop, period, nextDate, accountId: chosenAccount ?? '', categoryId, paused }
    try {
      if (s) await updateSubscription(s.id, input)
      else await createSubscription(input)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async () => {
    const ok = await askConfirm({ title: `Удалить подписку «${s!.name}»?`, text: 'Уже записанные траты останутся.', confirmLabel: 'Удалить' })
    if (!ok) return
    await deleteSubscription(s!.id)
    showToast('🗑 Подписка удалена')
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{s ? 'Подписка' : 'Новая подписка'}</h2>
        <CloseButton onClick={onDone} />
      </div>

      <input
        value={name}
        onChange={(e) => {
          setError('')
          setName(e.target.value)
        }}
        placeholder="Название, например «Кинопоиск»"
        aria-label="Название подписки"
        className="rounded-2xl bg-slate-100 px-4 py-3 font-medium dark:bg-slate-800"
      />

      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Сумма</span>
        <input
          value={amount}
          onChange={(e) => {
            setError('')
            setAmount(e.target.value)
          }}
          inputMode="decimal"
          placeholder="0"
          aria-label="Сумма подписки"
          className="tabular min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-right text-xl font-semibold dark:bg-slate-800"
        />
        <span className="font-semibold text-slate-400">₽</span>
      </label>

      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Как часто</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Периодичность">
          {(Object.keys(PERIODS) as SubscriptionPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-2xl border-2 py-2 text-sm font-medium ${
                period === p
                  ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'border-transparent bg-slate-100 dark:bg-slate-800'
              }`}
            >
              {PERIODS[p].label}
            </button>
          ))}
        </div>
        {kop !== null && kop > 0 && period !== 'month' && (
          <p className="mt-1.5 text-xs text-slate-400">≈ {approx(monthlyEquivalent(kop, period))} в месяц</p>
        )}
      </div>

      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Следующее списание</span>
        <input
          type="date"
          value={nextDate}
          onChange={(e) => e.target.value && setNextDate(e.target.value)}
          aria-label="Дата следующего списания"
          className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800"
        />
      </label>

      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Со счёта</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Счёт">
          {selectable.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={chosenAccount === a.id}
              onClick={() => setAccountId(a.id)}
              className={`rounded-full border-2 px-3 py-1.5 text-sm font-medium ${
                chosenAccount === a.id
                  ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                  : 'border-transparent bg-slate-100 dark:bg-slate-800'
              }`}
            >
              {a.emoji} {a.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Категория</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Категория">
          {expense.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[11px] leading-tight font-medium ${
                categoryId === c.id ? 'ring-2 ring-violet-500' : ''
              }`}
              style={{ backgroundColor: `${c.color}1f` }}
            >
              <span className="text-xl" aria-hidden>
                {c.emoji}
              </span>
              <span className="line-clamp-1">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {s && (
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} className="h-5 w-5 accent-violet-600" />
          <span>
            <span className="block font-medium">На паузе</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Не напоминать и не считать в сумму за месяц</span>
          </span>
        </label>
      )}

      <p className="h-5 text-sm font-medium text-rose-500" role="alert">
        {error}
      </p>
      <button type="button" onClick={save} className="rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
        Сохранить
      </button>
      {s && (
        <button
          type="button"
          onClick={remove}
          className="rounded-2xl bg-rose-50 py-3 font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
        >
          🗑 Удалить подписку
        </button>
      )}
    </div>
  )
}

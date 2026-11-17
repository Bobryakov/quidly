import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TransactionRow } from '../components/TransactionRow'
import { useAccounts, useById, useCategories, useTransactions } from '../db/hooks'
import type { Transaction, TransactionType } from '../db/types'
import { sumByType } from '../lib/balance'
import { dayTitle, isoToRu, monthKey, monthTitle, shiftMonth, shortDayLabel, todayISO } from '../lib/dates'
import { formatMoney } from '../lib/format'

const FILTERS: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
]

/**
 * Фильтры хранятся в адресе экрана (?month=…&type=…&account=…&category=…&day=…&from=…&to=…),
 * поэтому «Аналитика» может открыть, например, операции одной категории или одного дня.
 */
export function OperationsPage() {
  const accounts = useAccounts()
  const categories = useCategories()
  const transactions = useTransactions()
  const catById = useById(categories)
  const accById = useById(accounts)
  const [params, setParams] = useSearchParams()

  const today = todayISO()
  const month = params.get('month') ?? monthKey(today)
  const type = (params.get('type') as TransactionType | null) ?? 'all'
  const accountId = params.get('account') ?? ''
  const categoryId = params.get('category') ?? ''
  const day = params.get('day') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const query = params.get('q') ?? ''

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  // Какой отрезок времени показываем: день, свой период (из аналитики) или месяц
  const range = day ? { from: day, to: day } : from && to ? { from, to } : null

  const filtered = useMemo(() => {
    if (!transactions) return []
    const q = query.trim().toLowerCase()
    return transactions.filter((t) => {
      if (q) {
        // Поиск — по всем месяцам: по комментарию и названию категории
        const cat = t.categoryId ? catById.get(t.categoryId)?.name : 'перевод'
        if (![t.comment, cat].some((s) => s?.toLowerCase().includes(q))) return false
      } else if (range) {
        if (t.date < range.from || t.date > range.to) return false
      } else if (monthKey(t.date) !== month) return false
      if (type !== 'all' && t.type !== type) return false
      if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false
      if (categoryId && t.categoryId !== categoryId) return false
      return true
    })
  }, [transactions, month, type, query, catById, accountId, categoryId, range?.from, range?.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const t of filtered) groups.set(t.date, [...(groups.get(t.date) ?? []), t])
    return [...groups.entries()]
  }, [filtered])

  if (!transactions || !accounts || !categories) return null
  const totals = sumByType(filtered)
  const cat = categoryId ? catById.get(categoryId) : undefined
  const anyFilter = Boolean(accountId || categoryId || day || from || type !== 'all')

  return (
    <>
      <PageHeader title="Операции" />

      <input
        type="search"
        value={query}
        onChange={(e) => set({ q: e.target.value })}
        placeholder="🔍 Поиск: комментарий, категория"
        aria-label="Поиск"
        className="mb-3 w-full rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900"
      />

      {!query && (
        <>
          {range ? (
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-violet-50 px-4 py-2.5 dark:bg-violet-500/15">
              <span className="font-semibold">
                {day ? dayTitle(day, today) : `${isoToRu(from)} — ${isoToRu(to)}`}
              </span>
              <button
                type="button"
                aria-label="Показать весь месяц"
                onClick={() => set({ day: '', from: '', to: '', month: monthKey(range.from) })}
                className="text-sm font-medium text-violet-600 dark:text-violet-300"
              >
                весь месяц ✕
              </button>
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-2 py-1.5 shadow-sm dark:bg-slate-900">
              <button type="button" aria-label="Предыдущий месяц" onClick={() => set({ month: shiftMonth(month, -1) })} className="h-9 w-9 text-xl">
                ‹
              </button>
              <span className="font-semibold">{monthTitle(month)}</span>
              <button
                type="button"
                aria-label="Следующий месяц"
                onClick={() => set({ month: shiftMonth(month, 1) })}
                disabled={month >= monthKey(today)}
                className="h-9 w-9 text-xl disabled:opacity-30"
              >
                ›
              </button>
            </div>
          )}

          <div className="mb-3 flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Тип операций">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={type === f.value}
                onClick={() => set({ type: f.value === 'all' ? '' : f.value })}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                  type === f.value ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <select
              value={accountId}
              onChange={(e) => set({ account: e.target.value })}
              aria-label="Счёт"
              className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${accountId ? 'bg-violet-100 font-medium dark:bg-violet-500/20' : 'bg-white dark:bg-slate-900'}`}
            >
              <option value="">Все счета</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </select>
            <select
              value={categoryId}
              onChange={(e) => set({ category: e.target.value })}
              aria-label="Категория"
              className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${categoryId ? 'bg-violet-100 font-medium dark:bg-violet-500/20' : 'bg-white dark:bg-slate-900'}`}
            >
              <option value="">Все категории</option>
              <optgroup label="Расходы">
                {categories
                  .filter((c) => c.kind === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Доходы">
                {categories
                  .filter((c) => c.kind === 'income')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          {anyFilter && (
            <button
              type="button"
              onClick={() => set({ type: '', account: '', category: '', day: '', from: '', to: '' })}
              className="mb-3 text-sm font-medium text-violet-600 dark:text-violet-400"
            >
              Сбросить фильтры ✕
            </button>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Расходы{cat ? ` · ${cat.name}` : ''}</p>
              <p className="tabular text-lg font-bold" aria-label="Расходы за период">
                {formatMoney(totals.expense, { hideZeroKopecks: true })}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Доходы</p>
              <p className="tabular text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatMoney(totals.income, { hideZeroKopecks: true })}
              </p>
            </div>
          </div>
        </>
      )}

      {days.length === 0 ? (
        query ? (
          <EmptyState emoji="🔍" title="Ничего не нашлось" hint="Попробуйте другое слово" />
        ) : anyFilter ? (
          <EmptyState emoji="🧐" title="Нет таких операций" hint="Попробуйте другой месяц или сбросьте фильтры" />
        ) : (
          <EmptyState emoji="📋" title="Операций пока нет" hint="Нажми ➕, чтобы добавить первую трату" />
        )
      ) : (
        <div className="space-y-3">
          {days.map(([date, list]) => {
            const spent = sumByType(list).expense
            return (
              <section key={date} className="rounded-3xl bg-white px-4 py-2 shadow-sm dark:bg-slate-900" aria-label={shortDayLabel(date, today)}>
                <div className="flex items-baseline justify-between pt-1 pb-1 text-sm">
                  <h2 className="font-semibold text-slate-500 dark:text-slate-400">{dayTitle(date, today)}</h2>
                  {spent > 0 && <span className="tabular text-slate-400">−{formatMoney(spent, { hideZeroKopecks: true })}</span>}
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((t) => (
                    <TransactionRow key={t.id} t={t} categories={catById} accounts={accById} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

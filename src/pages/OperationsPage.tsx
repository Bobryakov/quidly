import { useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { TransactionRow } from '../components/TransactionRow'
import { useAccounts, useById, useCategories, useTransactions } from '../db/hooks'
import type { Transaction, TransactionType } from '../db/types'
import { sumByType } from '../lib/balance'
import { dayTitle, monthKey, monthTitle, shiftMonth, todayISO } from '../lib/dates'
import { formatMoney } from '../lib/format'

const FILTERS: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
]

export function OperationsPage() {
  const accounts = useAccounts()
  const categories = useCategories()
  const transactions = useTransactions()
  const catById = useById(categories)
  const accById = useById(accounts)

  const [month, setMonth] = useState(() => monthKey(todayISO()))
  const [type, setType] = useState<TransactionType | 'all'>('all')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!transactions) return []
    const q = query.trim().toLowerCase()
    return transactions.filter((t) => {
      if (q) {
        // Поиск — по всем месяцам: по комментарию и названию категории
        const cat = t.categoryId ? catById.get(t.categoryId)?.name : 'перевод'
        return [t.comment, cat].some((s) => s?.toLowerCase().includes(q))
      }
      return monthKey(t.date) === month && (type === 'all' || t.type === type)
    })
  }, [transactions, month, type, query, catById])

  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const t of filtered) groups.set(t.date, [...(groups.get(t.date) ?? []), t])
    return [...groups.entries()]
  }, [filtered])

  if (!transactions) return null
  const totals = sumByType(filtered)
  const today = todayISO()

  return (
    <>
      <PageHeader title="Операции" />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Поиск: комментарий, категория"
        aria-label="Поиск"
        className="mb-3 w-full rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900"
      />

      {!query && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-2 py-1.5 shadow-sm dark:bg-slate-900">
            <button type="button" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))} className="h-9 w-9 text-xl">
              ‹
            </button>
            <span className="font-semibold">{monthTitle(month)}</span>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= monthKey(today)}
              className="h-9 w-9 text-xl disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Тип операций">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={type === f.value}
                onClick={() => setType(f.value)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                  type === f.value
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Расходы</p>
              <p className="tabular text-lg font-bold">{formatMoney(totals.expense, { hideZeroKopecks: true })}</p>
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
        ) : (
          <EmptyState emoji="📋" title="Операций пока нет" hint="Нажми ➕, чтобы добавить первую трату" />
        )
      ) : (
        <div className="space-y-3">
          {days.map(([date, list]) => {
            const spent = sumByType(list).expense
            return (
              <section key={date} className="rounded-3xl bg-white px-4 py-2 shadow-sm dark:bg-slate-900">
                <div className="flex items-baseline justify-between pt-1 pb-1 text-sm">
                  <h2 className="font-semibold text-slate-500 dark:text-slate-400">{dayTitle(date, today)}</h2>
                  {spent > 0 && (
                    <span className="tabular text-slate-400">−{formatMoney(spent, { hideZeroKopecks: true })}</span>
                  )}
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

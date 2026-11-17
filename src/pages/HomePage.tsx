import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { HomeBudgetCard } from '../components/HomeBudgetCard'
import { MonthSummaryCard } from '../components/MonthSummaryCard'
import { SubscriptionDue } from '../components/SubscriptionDue'
import { TransactionRow } from '../components/TransactionRow'
import {
  useAccounts,
  useBalances,
  useBudgetContext,
  useById,
  useCategories,
  useNoticeDays,
  useSubscriptions,
  useTransactions,
} from '../db/hooks'
import { sumByType, totalBalance } from '../lib/balance'
import { budgetFor, pendingSummaryMonth } from '../lib/budget'
import { monthKey, todayISO } from '../lib/dates'
import { formatDate, formatMoney } from '../lib/format'

export function HomePage() {
  const accounts = useAccounts()
  const categories = useCategories()
  const transactions = useTransactions()
  const balances = useBalances(accounts, transactions)
  const catById = useById(categories)
  const accById = useById(accounts)
  const [now] = useState(() => new Date())
  const budgetCtx = useBudgetContext()
  const subscriptions = useSubscriptions()
  const noticeDays = useNoticeDays()

  if (!accounts || !transactions || !balances || !budgetCtx || !subscriptions || noticeDays === undefined) return null

  const active = accounts.filter((a) => !a.archived)
  const total = totalBalance(accounts, balances)
  const month = monthKey(todayISO())
  const { expense, income } = sumByType(transactions.filter((t) => monthKey(t.date) === month))
  const recent = transactions.slice(0, 5)
  const mb = budgetFor(budgetCtx, month)
  const pending = pendingSummaryMonth(budgetCtx, todayISO())

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Quidly</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">{formatDate(now)}</span>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 p-6 text-white shadow-lg shadow-fuchsia-500/20">
        <p className="text-sm font-medium opacity-90">Общий баланс</p>
        <p className="tabular mt-1 text-4xl font-extrabold" aria-label="Общий баланс">
          {formatMoney(total)}
        </p>
        <div className="mt-4 flex gap-4 text-sm">
          <span>
            <span className="opacity-80">Расходы за месяц</span>
            <br />
            <b className="tabular text-base">{formatMoney(expense, { hideZeroKopecks: true })}</b>
          </span>
          <span>
            <span className="opacity-80">Доходы</span>
            <br />
            <b className="tabular text-base">{formatMoney(income, { hideZeroKopecks: true })}</b>
          </span>
        </div>
      </section>

      <SubscriptionDue subscriptions={subscriptions} categories={catById} noticeDays={noticeDays} />

      {pending && <MonthSummaryCard key={pending} ctx={budgetCtx} month={pending} categories={catById} />}

      <HomeBudgetCard mb={mb} categories={catById} />

      {/* Счета */}
      <section aria-label="Счета" className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {active.map((a) => (
          <Link
            key={a.id}
            to="/settings/accounts"
            className="min-w-36 shrink-0 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900"
            style={{ borderTop: `4px solid ${a.color}` }}
          >
            <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
              {a.emoji} {a.name}
            </span>
            <span className="tabular block text-lg font-bold">{formatMoney(balances.get(a.id) ?? 0)}</span>
          </Link>
        ))}
      </section>

      {recent.length === 0 ? (
        <EmptyState emoji="🌱" title="Пока пусто" hint="Нажми ➕, чтобы добавить первую трату" />
      ) : (
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-semibold">Последние операции</h2>
            <Link to="/operations" className="text-sm font-medium text-violet-600 dark:text-violet-400">
              Все →
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((t) => (
              <TransactionRow key={t.id} t={t} categories={catById} accounts={accById} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

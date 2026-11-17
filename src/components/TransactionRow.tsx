import type { Account, Category, Transaction } from '../db/types'
import { formatMoney } from '../lib/format'
import { openQuickAdd } from '../lib/store'
import { EmojiBubble } from './Pickers'

type Props = {
  t: Transaction
  categories: Map<string, Category>
  accounts: Map<string, Account>
}

/** Строка операции в списке. Тап — открыть для правки. */
export function TransactionRow({ t, categories, accounts }: Props) {
  const cat = t.categoryId ? categories.get(t.categoryId) : undefined
  const from = accounts.get(t.accountId)
  const to = t.toAccountId ? accounts.get(t.toAccountId) : undefined

  const title = t.type === 'transfer' ? 'Перевод' : (cat?.name ?? 'Без категории')
  const subtitle =
    t.type === 'transfer'
      ? `${from?.name ?? '?'} → ${to?.name ?? '?'}`
      : [t.comment, from?.name].filter(Boolean).join(' · ')
  const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''
  const color =
    t.type === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : t.type === 'transfer'
        ? 'text-sky-600 dark:text-sky-400'
        : 'text-slate-900 dark:text-slate-100'

  return (
    <button
      type="button"
      onClick={() => openQuickAdd(t.id)}
      className="flex w-full items-center gap-3 px-1 py-2.5 text-left active:opacity-60"
    >
      {t.type === 'transfer' ? (
        <EmojiBubble emoji="⇄" color="#0ea5e9" />
      ) : (
        <EmojiBubble emoji={cat?.emoji ?? '❔'} color={cat?.color ?? '#64748b'} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && <span className="block truncate text-sm text-slate-500 dark:text-slate-400">{subtitle}</span>}
      </span>
      <span className={`tabular shrink-0 font-semibold ${color}`}>
        {sign}
        {formatMoney(t.amount, { hideZeroKopecks: true })}
      </span>
    </button>
  )
}

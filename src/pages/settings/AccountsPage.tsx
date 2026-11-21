import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '../../components/PageHeader'
import { ColorPicker, EmojiBubble, EmojiPicker } from '../../components/Pickers'
import { CloseButton, Sheet } from '../../components/Sheet'
import { useAccounts, useBalances, useTransactions } from '../../db/hooks'
import { accountUsageCount, createAccount, deleteAccount, updateAccount } from '../../db/repo'
import { ACCOUNT_TYPES } from '../../db/seed'
import type { Account, AccountType } from '../../db/types'
import { parseAmount } from '../../lib/amount'
import { initialBalanceForTarget } from '../../lib/balance'
import { formatMoney } from '../../lib/format'
import { showToast } from '../../lib/store'
import { askConfirm } from '../../components/ConfirmHost'

type Editing = { mode: 'new' } | { mode: 'edit'; account: Account }

export function AccountsPage() {
  const accounts = useAccounts()
  const transactions = useTransactions()
  const balances = useBalances(accounts, transactions)
  const [editing, setEditing] = useState<Editing | null>(null)

  if (!accounts || !balances) return null
  const active = accounts.filter((a) => !a.archived)
  const archived = accounts.filter((a) => a.archived)

  const row = (a: Account) => (
    <button
      key={a.id}
      type="button"
      onClick={() => setEditing({ mode: 'edit', account: a })}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      <EmojiBubble emoji={a.emoji} color={a.color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{ACCOUNT_TYPES[a.type].label}</span>
      </span>
      <span className="tabular font-semibold">{formatMoney(balances.get(a.id) ?? 0)}</span>
    </button>
  )

  return (
    <>
      <BackLink />
      <PageHeader title="Счета" />
      <section className="rounded-3xl bg-white px-4 py-1 shadow-sm dark:bg-slate-900">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">{active.map(row)}</div>
      </section>
      <button
        type="button"
        onClick={() => setEditing({ mode: 'new' })}
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-violet-200 py-3 font-medium text-violet-600 dark:border-violet-500/30 dark:text-violet-300"
      >
        + Добавить счёт
      </button>

      {archived.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 px-1 font-semibold text-slate-500 dark:text-slate-400">В архиве</h2>
          <section className="rounded-3xl bg-white px-4 py-1 opacity-70 shadow-sm dark:bg-slate-900">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">{archived.map(row)}</div>
          </section>
        </>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Счёт">
        {editing && (
          <AccountForm
            key={editing.mode === 'edit' ? editing.account.id : 'new'}
            editing={editing}
            currentBalance={editing.mode === 'edit' ? (balances.get(editing.account.id) ?? 0) : 0}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  )
}

export function BackLink() {
  return (
    <Link to="/settings" className="mb-2 inline-block text-sm font-medium text-violet-600 dark:text-violet-400">
      ‹ Настройки
    </Link>
  )
}

function AccountForm({
  editing,
  currentBalance,
  onDone,
}: {
  editing: Editing
  currentBalance: number
  onDone: () => void
}) {
  const a = editing.mode === 'edit' ? editing.account : undefined
  const [name, setName] = useState(a?.name ?? '')
  const [type, setType] = useState<AccountType>(a?.type ?? 'card')
  const [emoji, setEmoji] = useState(a?.emoji ?? '💳')
  const [color, setColor] = useState(a?.color ?? '#3b82f6')
  const [balance, setBalance] = useState(a ? formatMoney(currentBalance).replace(/\s?₽$/, '') : '')
  const [error, setError] = useState('')

  const save = async () => {
    const target = parseAmount(balance)
    if (target === null) return setError('Не получается прочитать сумму. Пример: 12 345,67')
    try {
      if (a) {
        await updateAccount(a.id, {
          name,
          type,
          emoji,
          color,
          initialBalance: initialBalanceForTarget(a, currentBalance, target),
        })
      } else {
        await createAccount({ name, type, emoji, color, initialBalance: target })
      }
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const toggleArchive = async () => {
    await updateAccount(a!.id, { archived: !a!.archived })
    showToast(a!.archived ? 'Счёт возвращён из архива' : 'Счёт убран в архив')
    onDone()
  }

  const remove = async () => {
    if ((await accountUsageCount(a!.id)) > 0) {
      return setError('У счёта есть операции — его можно только убрать в архив')
    }
    if (!(await askConfirm({ title: `Удалить счёт «${a!.name}»?`, text: 'Операций по нему нет.', confirmLabel: 'Удалить' }))) return
    await deleteAccount(a!.id)
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{a ? 'Счёт' : 'Новый счёт'}</h2>
        <CloseButton onClick={onDone} />
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название, например «Тинькофф»"
        aria-label="Название счёта"
        className="rounded-2xl bg-slate-100 px-4 py-3 font-medium dark:bg-slate-800"
      />

      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Тип счёта">
        {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => {
              setType(t)
              setEmoji(ACCOUNT_TYPES[t].emoji)
            }}
            className={`rounded-2xl border-2 py-2 text-sm font-medium ${
              type === t
                ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                : 'border-transparent bg-slate-100 dark:bg-slate-800'
            }`}
          >
            {ACCOUNT_TYPES[t].emoji} {ACCOUNT_TYPES[t].label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Сейчас на счёте</span>
        <input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-label="Сейчас на счёте"
          className="tabular min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-right text-lg font-semibold dark:bg-slate-800"
        />
        <span className="font-semibold text-slate-400">₽</span>
      </label>

      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Значок</p>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </div>
      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Цвет</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <p className="h-5 text-sm font-medium text-rose-500" role="alert">
        {error}
      </p>

      <button type="button" onClick={save} className="rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
        Сохранить
      </button>
      {a && (
        <div className="flex gap-2">
          <button type="button" onClick={toggleArchive} className="flex-1 rounded-2xl bg-slate-100 py-3 font-medium dark:bg-slate-800">
            {a.archived ? '📤 Вернуть из архива' : '📦 В архив'}
          </button>
          <button
            type="button"
            onClick={remove}
            className="flex-1 rounded-2xl bg-rose-50 py-3 font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
          >
            🗑 Удалить
          </button>
        </div>
      )}
    </div>
  )
}

import { motion, useAnimationControls } from 'framer-motion'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import { useAccounts, useCategories, useLastAccountId, useTransactions } from '../db/hooks'
import {
  addTransaction,
  deleteTransaction,
  restoreTransaction,
  updateTransaction,
  type TransactionInput,
} from '../db/repo'
import type { Account, Category, TransactionType } from '../db/types'
import { displayKeypad, keypadToKopecks, kopecksToKeypad, pressKey, type KeypadKey } from '../lib/amount'
import { withBudgetWarning } from '../db/budgetWatch'
import { orderCategoriesByUsage } from '../lib/categoryOrder'
import { shortDayLabel, todayISO } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { closeQuickAdd, openQuickAdd, quickAdd, showToast } from '../lib/store'
import { Keypad } from './Keypad'
import { CloseButton, Sheet } from './Sheet'

/** Круглая кнопка «+» над нижним меню. */
export function QuickAddButton() {
  return (
    <motion.button
      type="button"
      aria-label="Добавить операцию"
      onClick={() => openQuickAdd()}
      whileTap={{ scale: 0.9 }}
      className="fixed right-5 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-4xl font-light text-white shadow-lg shadow-pink-500/30"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
    >
      +
    </motion.button>
  )
}

/** Панель быстрого ввода и правки операции. */
export function QuickAddSheet() {
  const state = quickAdd.use()
  return (
    <Sheet open={state.open} onClose={closeQuickAdd} label="Быстрый ввод">
      {state.open && <QuickAddForm key={state.nonce} editId={state.editId} />}
    </Sheet>
  )
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Расход' },
  { value: 'income', label: 'Доход' },
  { value: 'transfer', label: 'Перевод' },
]

type Form = {
  type: TransactionType
  amount: string
  accountId: string
  toAccountId: string
  categoryId?: string
  date: string
  comment: string
}

function QuickAddForm({ editId }: { editId?: string }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const transactions = useTransactions()
  const lastAccountId = useLastAccountId()
  const [form, setForm] = useState<Form | null>(null)
  const [panel, setPanel] = useState<'none' | 'account' | 'comment'>('none')
  const [error, setError] = useState('')
  const shake = useAnimationControls()
  const isEdit = Boolean(editId)

  // Начальное заполнение формы — когда данные загрузились из базы (асинхронно,
  // поэтому через эффект, а не сразу при создании состояния)
  useEffect(() => {
    if (form || !accounts || lastAccountId === undefined) return
    const active = accounts.filter((a) => !a.archived)
    if (editId) {
      db.transactions.get(editId).then((t) => {
        if (!t) return closeQuickAdd()
        setForm({
          type: t.type,
          amount: kopecksToKeypad(t.amount),
          accountId: t.accountId,
          toAccountId: t.toAccountId ?? active.find((a) => a.id !== t.accountId)?.id ?? '',
          categoryId: t.categoryId,
          date: t.date,
          comment: t.comment ?? '',
        })
        if (t.comment) setPanel('comment')
      })
    } else {
      const from = active.find((a) => a.id === lastAccountId) ?? active[0]
      setForm({
        type: 'expense',
        amount: '',
        accountId: from?.id ?? '',
        toAccountId: active.find((a) => a.id !== from?.id)?.id ?? '',
        date: todayISO(),
        comment: '',
      })
    }
  }, [accounts, lastAccountId, editId, form])

  const formType = form?.type
  const orderedCategories = useMemo(() => {
    if (!categories || !transactions || !formType || formType === 'transfer') return []
    const ofKind = categories.filter((c) => c.kind === formType)
    return isEdit ? ofKind : orderCategoriesByUsage(ofKind, transactions, todayISO())
  }, [categories, transactions, formType, isEdit])

  if (!form || !accounts) return <div className="h-96" />

  const update = (patch: Partial<Form>) => {
    setError('')
    setForm({ ...form, ...patch })
  }
  // Счета для выбора: активные + архивный, если он уже выбран у старой операции
  const selectable = accounts.filter((a) => !a.archived || a.id === form.accountId || a.id === form.toAccountId)
  const account = accounts.find((a) => a.id === form.accountId)
  const amountKop = keypadToKopecks(form.amount)

  const fail = (msg: string) => {
    setError(msg)
    shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } })
  }

  const buildInput = (categoryId = form.categoryId): TransactionInput => ({
    type: form.type,
    amount: amountKop,
    date: form.date,
    accountId: form.accountId,
    toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
    categoryId: form.type === 'transfer' ? undefined : categoryId,
    comment: form.comment,
  })

  const save = async (categoryId?: string) => {
    if (amountKop <= 0) return fail('Сначала введите сумму')
    const input = buildInput(categoryId)
    try {
      // Предупредить, если трата перевела бюджет категории за 80% или 100%
      const { warning } = await withBudgetWarning(
        input.type === 'expense' ? input.categoryId : undefined,
        input.date,
        () => (isEdit ? updateTransaction(editId!, input) : addTransaction(input).then(() => undefined)),
      )
      let text: string
      if (isEdit) text = '✓ Изменения сохранены'
      else {
        const cat = categories?.find((c) => c.id === categoryId)
        const what = form.type === 'transfer' ? '⇄ Перевод' : `${cat?.emoji} ${cat?.name}`
        text = `✓ ${what} — ${formatMoney(amountKop, { hideZeroKopecks: true })}`
      }
      if (warning) text += ` · ${warning}`
      closeQuickAdd()
      showToast(text, undefined, warning ? 4500 : undefined)
    } catch (e) {
      fail((e as Error).message)
    }
  }

  const remove = async () => {
    const removed = await deleteTransaction(editId!)
    closeQuickAdd()
    if (removed) {
      showToast('🗑 Операция удалена', { label: 'Отменить', onClick: () => void restoreTransaction(removed) })
    }
  }

  const onCategory = (c: Category) => {
    if (isEdit) update({ categoryId: c.id })
    else void save(c.id)
  }

  const amountColor =
    form.type === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : form.type === 'transfer'
        ? 'text-sky-600 dark:text-sky-400'
        : 'text-slate-900 dark:text-white'

  return (
    <div className="flex flex-col gap-3">
      {/* Тип операции */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="radiogroup" aria-label="Тип операции">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={form.type === t.value}
              onClick={() => update({ type: t.value, categoryId: undefined })}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
                form.type === t.value
                  ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-950 dark:text-violet-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CloseButton onClick={closeQuickAdd} />
      </div>

      {/* Сумма */}
      <motion.div animate={shake} className="text-center">
        <p className={`tabular text-5xl font-extrabold tracking-tight ${amountColor}`} aria-label="Сумма" aria-live="polite">
          {displayKeypad(form.amount)}
          <span className="ml-1 text-3xl opacity-60">₽</span>
        </p>
        <p className="mt-1 h-5 text-sm font-medium text-rose-500" role="alert">
          {error}
        </p>
      </motion.div>

      {/* Счёт, дата, комментарий */}
      {form.type !== 'transfer' && (
        <div className="flex gap-2">
          <Chip onClick={() => setPanel(panel === 'account' ? 'none' : 'account')} active={panel === 'account'}>
            {account ? `${account.emoji} ${account.name}` : 'Счёт'}
          </Chip>
          <DateChip value={form.date} onChange={(date) => update({ date })} />
          <Chip
            onClick={() => setPanel(panel === 'comment' ? 'none' : 'comment')}
            active={panel === 'comment' || Boolean(form.comment)}
            label="Комментарий"
          >
            💬
          </Chip>
        </div>
      )}
      {form.type !== 'transfer' && panel === 'account' && (
        <AccountChoice
          accounts={selectable}
          value={form.accountId}
          onChange={(accountId) => {
            update({ accountId })
            setPanel('none')
          }}
        />
      )}
      {panel === 'comment' && (
        <input
          autoFocus={!isEdit}
          value={form.comment}
          onChange={(e) => update({ comment: e.target.value })}
          placeholder="Комментарий (необязательно)"
          aria-label="Комментарий"
          className="rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-800"
        />
      )}

      <Keypad onKey={(k: KeypadKey) => update({ amount: pressKey(form.amount, k) })} />

      {/* Категории или счета перевода */}
      {form.type === 'transfer' ? (
        <TransferFields
          accounts={selectable}
          form={form}
          update={update}
          onComment={() => setPanel(panel === 'comment' ? 'none' : 'comment')}
        />
      ) : (
        <div>
          {!isEdit && <p className="mb-2 text-xs font-medium text-slate-400">Нажмите категорию — и готово</p>}
          <div className="grid grid-cols-4 gap-2">
            {orderedCategories.map((c) => {
              const selected = isEdit && form.categoryId === c.id
              return (
                <motion.button
                  key={c.id}
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  onClick={() => onCategory(c)}
                  aria-pressed={isEdit ? selected : undefined}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] leading-tight font-medium ${
                    selected ? 'ring-2 ring-violet-500' : ''
                  }`}
                  style={{ backgroundColor: `${c.color}1f` }}
                >
                  <span className="text-2xl" aria-hidden>
                    {c.emoji}
                  </span>
                  <span className="line-clamp-2 text-center">{c.name}</span>
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {(isEdit || form.type === 'transfer') && (
        <div className="flex gap-2 pt-1">
          {isEdit && (
            <button
              type="button"
              onClick={remove}
              className="rounded-2xl bg-rose-50 px-5 py-3.5 font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
            >
              🗑 Удалить
            </button>
          )}
          <button
            type="button"
            onClick={() => save()}
            className="flex-1 rounded-2xl bg-violet-600 py-3.5 font-semibold text-white active:bg-violet-700"
          >
            {isEdit ? 'Сохранить' : 'Перевести'}
          </button>
        </div>
      )}
    </div>
  )
}

function Chip({
  children,
  onClick,
  active,
  label,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`min-w-0 truncate rounded-full px-3 py-2 text-sm font-medium ${
        active
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

/** Кнопка даты: поверх неё лежит невидимое системное поле выбора даты. */
function DateChip({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  return (
    <label className="relative shrink-0 cursor-pointer rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      📅 {shortDayLabel(value)}
      <input
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Дата"
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  )
}

function AccountChoice({
  accounts,
  value,
  onChange,
  exclude,
  label = 'Счёт',
}: {
  accounts: Account[]
  value: string
  onChange: (id: string) => void
  exclude?: string
  label?: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {accounts
        .filter((a) => a.id !== exclude)
        .map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={a.id === value}
            onClick={() => onChange(a.id)}
            className={`rounded-full border-2 px-3 py-1.5 text-sm font-medium ${
              a.id === value
                ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                : 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {a.emoji} {a.name}
          </button>
        ))}
    </div>
  )
}

function TransferFields({
  accounts,
  form,
  update,
  onComment,
}: {
  accounts: Account[]
  form: Form
  update: (p: Partial<Form>) => void
  onComment: () => void
}) {
  if (accounts.length < 2) {
    return (
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
        Для перевода нужно хотя бы два счёта. Добавьте счёт в «Настройки → Счета».
      </p>
    )
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-400">Откуда</p>
        <AccountChoice
          label="Откуда"
          accounts={accounts}
          value={form.accountId}
          onChange={(accountId) =>
            update({
              accountId,
              toAccountId:
                accountId === form.toAccountId ? (accounts.find((a) => a.id !== accountId)?.id ?? '') : form.toAccountId,
            })
          }
        />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-400">Куда</p>
        <AccountChoice
          label="Куда"
          accounts={accounts}
          exclude={form.accountId}
          value={form.toAccountId}
          onChange={(toAccountId) => update({ toAccountId })}
        />
      </div>
      <div className="flex gap-2">
        <DateChip value={form.date} onChange={(date) => update({ date })} />
        <Chip onClick={onComment} active={Boolean(form.comment)} label="Комментарий">
          💬
        </Chip>
      </div>
    </div>
  )
}

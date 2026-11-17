import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { EmojiBubble } from '../components/Pickers'
import { LEVEL_TEXT, ProgressBar } from '../components/ProgressBar'
import { CloseButton, Sheet } from '../components/Sheet'
import { useBudgetContext, useById, useCarryOverspend, useCategories } from '../db/hooks'
import { META, setBudget, setMeta, updateCategory } from '../db/repo'
import { TOTAL_BUDGET, type Category } from '../db/types'
import { parseAmount } from '../lib/amount'
import { budgetFor, limitFor, type CategoryBudget } from '../lib/budget'
import { monthKey, monthTitle, todayISO } from '../lib/dates'
import { formatMoney } from '../lib/format'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })

type Editing = { kind: 'category'; category: Category } | { kind: 'total' }

export function BudgetsPage() {
  const ctx = useBudgetContext()
  const categories = useCategories()
  const catById = useById(categories)
  const carryOverspend = useCarryOverspend()
  const [editing, setEditing] = useState<Editing | null>(null)

  if (!ctx || !categories || carryOverspend === undefined) return null
  const month = monthKey(todayISO())
  const mb = budgetFor(ctx, month)
  const byCat = new Map(mb.categories.map((c) => [c.categoryId, c]))
  const expense = categories.filter((c) => c.kind === 'expense')
  const withBudget = expense.filter((c) => byCat.has(c.id))
  const without = expense.filter((c) => !byCat.has(c.id))

  return (
    <>
      <Link to="/settings" className="mb-2 inline-block text-sm font-medium text-violet-600 dark:text-violet-400">
        ‹ Настройки
      </Link>
      <PageHeader title="Бюджеты" />
      <p className="-mt-2 mb-4 text-slate-500 dark:text-slate-400">{monthTitle(month)}</p>

      {/* Общий бюджет */}
      <button
        type="button"
        onClick={() => setEditing({ kind: 'total' })}
        className="mb-4 w-full rounded-3xl bg-white p-5 text-left shadow-sm dark:bg-slate-900"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Общий бюджет</h2>
          <span className="text-xs text-slate-400">{mb.total.custom ? 'свой лимит' : 'сумма категорий'} ✎</span>
        </div>
        {mb.active ? (
          <>
            <p className="tabular mt-1 text-2xl font-extrabold">
              {money(mb.total.spent)} <span className="text-base font-medium text-slate-400">из {money(mb.total.limit)}</span>
            </p>
            <div className="mt-2">
              <ProgressBar percent={mb.total.percent} level={mb.total.level} />
            </div>
            <p className={`mt-2 text-sm font-medium ${LEVEL_TEXT[mb.total.level]}`}>
              {mb.total.left >= 0 ? `Осталось ${money(mb.total.left)}` : `Перерасход ${money(-mb.total.left)}`}
            </p>
          </>
        ) : (
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Задайте лимиты категориям ниже — общий бюджет посчитается сам. Или нажмите сюда и впишите свою сумму.
          </p>
        )}
      </button>

      {withBudget.length > 0 && (
        <section className="mb-4 rounded-3xl bg-white px-4 py-1 shadow-sm dark:bg-slate-900">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {withBudget.map((c) => (
              <BudgetRow key={c.id} category={c} b={byCat.get(c.id)!} onClick={() => setEditing({ kind: 'category', category: c })} />
            ))}
          </div>
        </section>
      )}

      {without.length > 0 && (
        <>
          <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Без лимита — нажмите, чтобы задать</h2>
          <section className="mb-4 rounded-3xl bg-white px-4 py-1 shadow-sm dark:bg-slate-900">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {without.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEditing({ kind: 'category', category: c })}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <EmojiBubble emoji={c.emoji} color={c.color} size="sm" />
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="text-sm text-violet-600 dark:text-violet-400">+ лимит</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <label className="flex items-start gap-3 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <input
          type="checkbox"
          checked={carryOverspend}
          onChange={(e) => setMeta(META.carryOverspend, e.target.checked)}
          className="mt-1 h-5 w-5 accent-violet-600"
        />
        <span>
          <span className="block font-medium">Переносить перерасход</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Если включено, перерасход уменьшит лимит следующего месяца. По умолчанию каждый месяц начинается без долга.
          </span>
        </span>
      </label>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Лимит">
        {editing?.kind === 'category' && (
          <CategoryLimitForm
            key={editing.category.id}
            category={catById.get(editing.category.id) ?? editing.category}
            current={limitFor(ctx.records, editing.category.id, month)}
            month={month}
            onDone={() => setEditing(null)}
          />
        )}
        {editing?.kind === 'total' && (
          <TotalLimitForm
            current={limitFor(ctx.records, TOTAL_BUDGET, month)}
            autoSum={mb.categories.reduce((s, c) => s + c.available, 0)}
            month={month}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  )
}

/** «2 500 ₽ из 10 000 ₽», полоска и «Лимит 10 000 ₽ + 1 200 ₽ с прошлого месяца». */
export function BudgetRow({ category, b, onClick }: { category: Category; b: CategoryBudget; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full py-3 text-left">
      <div className="flex items-center gap-3">
        <EmojiBubble emoji={category.emoji} color={category.color} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{category.name}</span>
            <span className="tabular shrink-0 text-sm">
              <b>{money(b.spent)}</b> <span className="text-slate-400">из {money(b.available)}</span>
            </span>
          </span>
          <span className="mt-1.5 block">
            <ProgressBar percent={b.percent} level={b.level} thin />
          </span>
          <span className="mt-1 flex justify-between gap-2 text-xs">
            <span className="text-slate-400">
              {b.carryIn !== 0
                ? `Лимит ${money(b.limit)} ${b.carryIn > 0 ? '+' : '−'} ${money(Math.abs(b.carryIn))} с прошлого месяца`
                : category.budgetRollover === false
                  ? 'без переноса остатка'
                  : ''}
            </span>
            <span className={`shrink-0 font-medium ${LEVEL_TEXT[b.level]}`}>
              {b.left >= 0 ? `осталось ${money(b.left)}` : `перерасход ${money(-b.left)}`}
            </span>
          </span>
        </span>
      </div>
    </button>
  )
}

function CategoryLimitForm({
  category,
  current,
  month,
  onDone,
}: {
  category: Category
  current: number | null
  month: string
  onDone: () => void
}) {
  const [value, setValue] = useState(current === null ? '' : String(current / 100).replace('.', ','))
  const [rollover, setRollover] = useState(category.budgetRollover !== false)
  const [error, setError] = useState('')

  const save = async () => {
    const kop = parseAmount(value)
    if (kop === null || kop < 0) return setError('Не получается прочитать сумму. Пример: 10 000')
    if (value.trim() === '') return setError('Впишите лимит или нажмите «Убрать лимит»')
    await setBudget(category.id, kop, month)
    if (rollover !== (category.budgetRollover !== false)) await updateCategory(category.id, { budgetRollover: rollover })
    onDone()
  }

  const remove = async () => {
    await setBudget(category.id, null, month)
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <EmojiBubble emoji={category.emoji} color={category.color} />
        <h2 className="flex-1 text-xl font-bold">{category.name}</h2>
        <CloseButton onClick={onDone} />
      </div>
      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Лимит в месяц</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setError('')
            setValue(e.target.value)
          }}
          inputMode="decimal"
          placeholder="0"
          aria-label="Лимит в месяц"
          className="tabular min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-right text-xl font-semibold dark:bg-slate-800"
        />
        <span className="font-semibold text-slate-400">₽</span>
      </label>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={rollover}
          onChange={(e) => setRollover(e.target.checked)}
          className="mt-1 h-5 w-5 accent-violet-600"
        />
        <span>
          <span className="block font-medium">Переносить остаток</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Неистраченное перейдёт в лимит следующего месяца. Удобно для «Подарков», не нужно для «Кафе».
          </span>
        </span>
      </label>
      <p className="text-xs text-slate-400">Новый лимит действует с этого месяца. Прошлые месяцы не меняются.</p>
      <p className="h-5 text-sm font-medium text-rose-500" role="alert">
        {error}
      </p>
      <button type="button" onClick={save} className="rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
        Сохранить
      </button>
      {current !== null && (
        <button type="button" onClick={remove} className="rounded-2xl bg-slate-100 py-3 font-medium dark:bg-slate-800">
          Убрать лимит
        </button>
      )}
    </div>
  )
}

function TotalLimitForm({
  current,
  autoSum,
  month,
  onDone,
}: {
  current: number | null
  autoSum: number
  month: string
  onDone: () => void
}) {
  const [value, setValue] = useState(current === null ? '' : String(current / 100).replace('.', ','))
  const [error, setError] = useState('')

  const save = async () => {
    const kop = parseAmount(value)
    if (kop === null || kop < 0 || value.trim() === '') return setError('Не получается прочитать сумму. Пример: 60 000')
    await setBudget(TOTAL_BUDGET, kop, month)
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Общий бюджет на месяц</h2>
        <CloseButton onClick={onDone} />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        По умолчанию это сумма лимитов всех категорий: сейчас <b className="tabular">{money(autoSum)}</b>. Можно вписать свою
        сумму — тогда в неё войдут все расходы месяца, даже по категориям без лимита.
      </p>
      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Свой лимит</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setError('')
            setValue(e.target.value)
          }}
          inputMode="decimal"
          placeholder={String(autoSum / 100)}
          aria-label="Свой общий лимит"
          className="tabular min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-right text-xl font-semibold dark:bg-slate-800"
        />
        <span className="font-semibold text-slate-400">₽</span>
      </label>
      <p className="h-5 text-sm font-medium text-rose-500" role="alert">
        {error}
      </p>
      <button type="button" onClick={save} className="rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
        Сохранить
      </button>
      {current !== null && (
        <button
          type="button"
          onClick={async () => {
            await setBudget(TOTAL_BUDGET, null, month)
            onDone()
          }}
          className="rounded-2xl bg-slate-100 py-3 font-medium dark:bg-slate-800"
        >
          Считать как сумму категорий
        </button>
      )}
    </div>
  )
}

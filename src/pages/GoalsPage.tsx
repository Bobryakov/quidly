import { useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ColorPicker, EmojiBubble, EmojiPicker } from '../components/Pickers'
import { CloseButton, Sheet } from '../components/Sheet'
import { useGoalMoves, useGoals } from '../db/hooks'
import { addGoalMove, createGoal, deleteGoal, deleteGoalMove, updateGoal } from '../db/repo'
import type { Goal, GoalMove } from '../db/types'
import { kopecksToKeypad, parseAmount } from '../lib/amount'
import { isoToRu, todayISO } from '../lib/dates'
import { formatMoney, plural } from '../lib/format'
import { goalBalances, goalPercent, goalPlan, totalSaved } from '../lib/goals'
import { celebrate, showToast } from '../lib/store'
import { daysBetween, relativeDay } from '../lib/subscriptions'
import { askConfirm } from '../components/ConfirmHost'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })

type Open = { kind: 'new' } | { kind: 'goal'; id: string } | { kind: 'edit'; goal: Goal }

export function GoalsPage() {
  const goals = useGoals()
  const moves = useGoalMoves()
  const [open, setOpen] = useState<Open | null>(null)

  if (!goals || !moves) return null
  const balances = goalBalances(moves)
  const today = todayISO()
  const active = goals.filter((g) => (balances.get(g.id) ?? 0) < g.target)
  const done = goals.filter((g) => (balances.get(g.id) ?? 0) >= g.target)
  const openGoal = open?.kind === 'goal' ? goals.find((g) => g.id === open.id) : undefined

  const card = (g: Goal) => {
    const balance = balances.get(g.id) ?? 0
    const percent = goalPercent(balance, g.target)
    const plan = goalPlan(g, balance, today)
    return (
      <button
        key={g.id}
        type="button"
        onClick={() => setOpen({ kind: 'goal', id: g.id })}
        className="block w-full rounded-3xl bg-white p-4 text-left shadow-sm dark:bg-slate-900"
        aria-label={`Цель ${g.name}`}
      >
        <div className="flex items-center gap-3">
          <EmojiBubble emoji={g.emoji} color={g.color} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{g.name}</p>
            <p className="tabular text-sm text-slate-500 dark:text-slate-400">
              <b className="text-slate-900 dark:text-white">{money(balance)}</b> из {money(g.target)}
            </p>
          </div>
          <span className="tabular text-lg font-extrabold" style={{ color: g.color }}>
            {Math.floor(percent)}%
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percent}%`, backgroundColor: g.color }} />
        </div>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {plan.kind === 'done' && '🎉 Цель достигнута!'}
          {plan.kind === 'no-deadline' && `Осталось ${money(plan.remaining)}`}
          {plan.kind === 'overdue' && `Срок прошёл · осталось ${money(plan.remaining)}`}
          {plan.kind === 'monthly' &&
            `Чтобы успеть к ${isoToRu(g.deadline!)}, откладывай ${money(plan.perMonth)} в месяц`}
        </p>
      </button>
    )
  }

  return (
    <>
      <PageHeader title="Цели" />

      {goals.length > 0 && (
        <section className="mb-4 rounded-3xl bg-gradient-to-br from-pink-500 via-rose-500 to-orange-400 p-5 text-white shadow-lg shadow-rose-500/20">
          <p className="text-sm opacity-90">🐷 Всего в копилках</p>
          <p className="tabular text-3xl font-extrabold" aria-label="Всего в копилках">
            {money(totalSaved(goals, balances))}
          </p>
          <p className="mt-1 text-sm opacity-80">
            Деньги лежат на ваших счетах — копилка просто помнит, что они отложены
          </p>
        </section>
      )}

      {goals.length === 0 ? (
        <EmptyState emoji="🐷" title="Копилок пока нет" hint="Заведите цель — отпуск, телефон, подушку безопасности — и откладывайте понемногу" />
      ) : (
        <div className="space-y-3">{active.map(card)}</div>
      )}

      <button
        type="button"
        onClick={() => setOpen({ kind: 'new' })}
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-violet-200 py-3 font-medium text-violet-600 dark:border-violet-500/30 dark:text-violet-300"
      >
        + Новая цель
      </button>

      {done.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 px-1 font-semibold text-slate-500 dark:text-slate-400">Достигнуты 🎉</h2>
          <div className="space-y-3">{done.map(card)}</div>
        </>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} label="Цель">
        {open?.kind === 'new' && <GoalForm onDone={() => setOpen(null)} />}
        {open?.kind === 'edit' && <GoalForm key={open.goal.id} goal={open.goal} onDone={() => setOpen({ kind: 'goal', id: open.goal.id })} />}
        {open?.kind === 'goal' && openGoal && (
          <GoalDetails
            key={openGoal.id}
            goal={openGoal}
            balance={balances.get(openGoal.id) ?? 0}
            moves={moves.filter((m) => m.goalId === openGoal.id)}
            onEdit={() => setOpen({ kind: 'edit', goal: openGoal })}
            onDone={() => setOpen(null)}
          />
        )}
      </Sheet>
    </>
  )
}

function GoalDetails({
  goal,
  balance,
  moves,
  onEdit,
  onDone,
}: {
  goal: Goal
  balance: number
  moves: GoalMove[]
  onEdit: () => void
  onDone: () => void
}) {
  const [mode, setMode] = useState<'in' | 'out' | null>(null)
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const today = todayISO()
  const plan = goalPlan(goal, balance, today)
  const percent = goalPercent(balance, goal.target)

  const submit = async () => {
    const kop = parseAmount(amount)
    if (kop === null || kop <= 0) return setError('Введите сумму, например 1000')
    try {
      const { moveId, achieved } = await addGoalMove(goal.id, mode === 'out' ? -kop : kop, today, { comment })
      setMode(null)
      setAmount('')
      setComment('')
      if (achieved) celebrate()
      showToast(
        achieved
          ? `🎉 Цель «${goal.name}» достигнута!`
          : `${mode === 'out' ? '↩︎ Снято' : '🐷 Отложено'} ${money(kop)}`,
        { label: 'Отменить', onClick: () => void deleteGoalMove(moveId) },
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async () => {
    const ok = await askConfirm({
      title: `Удалить копилку «${goal.name}»?`,
      text:
        balance > 0
          ? `Отложенные ${money(balance)} перестанут считаться отложенными. На счетах ничего не изменится.`
          : 'История пополнений тоже удалится.',
      confirmLabel: 'Удалить',
    })
    if (!ok) return
    await deleteGoal(goal.id)
    showToast('🗑 Копилка удалена')
    onDone()
  }

  const quick = [500, 1000, 5000]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <EmojiBubble emoji={goal.emoji} color={goal.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold">{goal.name}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {goal.deadline ? `до ${isoToRu(goal.deadline)} · ${relativeDay(Math.max(0, daysBetween(today, goal.deadline)))}` : 'без срока'}
          </p>
        </div>
        <CloseButton onClick={onDone} />
      </div>

      <div>
        <p className="tabular text-3xl font-extrabold">
          {money(balance)} <span className="text-lg font-medium text-slate-400">из {money(goal.target)}</span>
        </p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percent}%`, backgroundColor: goal.color }} />
        </div>
        {plan.kind === 'monthly' && (
          <p className="mt-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
            💡 Чтобы успеть к сроку, откладывай <b>{money(plan.perMonth)}</b> в месяц ({plan.months}{' '}
            {plural(plan.months, ['месяц', 'месяца', 'месяцев'])})
          </p>
        )}
        {plan.kind === 'overdue' && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Срок прошёл — можно поменять его в «Изменить»</p>
        )}
      </div>

      {mode === null ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('in')} className="flex-1 rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
            🐷 Пополнить
          </button>
          <button
            type="button"
            onClick={() => setMode('out')}
            disabled={balance <= 0}
            className="flex-1 rounded-2xl bg-slate-100 py-3.5 font-semibold disabled:opacity-40 dark:bg-slate-800"
          >
            ↩︎ Снять
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <p className="mb-2 font-semibold">{mode === 'in' ? 'Сколько отложить?' : 'Сколько снять?'}</p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={amount}
              onChange={(e) => {
                setError('')
                setAmount(e.target.value)
              }}
              inputMode="decimal"
              placeholder="0"
              aria-label={mode === 'in' ? 'Сумма пополнения' : 'Сумма снятия'}
              className="tabular min-w-0 flex-1 rounded-xl bg-white px-4 py-3 text-right text-xl font-semibold dark:bg-slate-900"
            />
            <span className="font-semibold text-slate-400">₽</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {mode === 'in'
              ? quick.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(String((parseAmount(amount) ?? 0) / 100 + q))}
                    className="rounded-full bg-white px-3 py-1 text-sm font-medium dark:bg-slate-900"
                  >
                    +{money(q * 100)}
                  </button>
                ))
              : (
                <button
                  type="button"
                  onClick={() => setAmount(kopecksToKeypad(balance))}
                  className="rounded-full bg-white px-3 py-1 text-sm font-medium dark:bg-slate-900"
                >
                  Всё ({money(balance)})
                </button>
              )}
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (необязательно)"
            aria-label="Комментарий к движению"
            className="mt-2 w-full rounded-xl bg-white px-4 py-2.5 text-sm dark:bg-slate-900"
          />
          <p className="mt-1 h-5 text-sm font-medium text-rose-500" role="alert">
            {error}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMode(null)} className="rounded-xl bg-white px-4 py-3 font-medium dark:bg-slate-900">
              Отмена
            </button>
            <button type="button" onClick={submit} className="flex-1 rounded-xl bg-violet-600 py-3 font-semibold text-white">
              {mode === 'in' ? 'Отложить' : 'Снять'}
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1 font-semibold">История</h3>
        {moves.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Пока пусто — нажмите «Пополнить»</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block">{isoToRu(m.date)}</span>
                  {m.comment && <span className="block truncate text-slate-500 dark:text-slate-400">{m.comment}</span>}
                </span>
                <span className={`tabular shrink-0 font-semibold ${m.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                  {m.amount > 0 ? '+' : '−'}
                  {money(Math.abs(m.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="flex-1 rounded-2xl bg-slate-100 py-3 font-medium dark:bg-slate-800">
          ✎ Изменить
        </button>
        <button
          type="button"
          onClick={remove}
          className="flex-1 rounded-2xl bg-rose-50 py-3 font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
        >
          🗑 Удалить
        </button>
      </div>
    </div>
  )
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🏖️')
  const [color, setColor] = useState(goal?.color ?? '#0ea5e9')
  const [target, setTarget] = useState(goal ? kopecksToKeypad(goal.target) : '')
  const [hasDeadline, setHasDeadline] = useState(Boolean(goal?.deadline))
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [error, setError] = useState('')

  const save = async () => {
    const kop = parseAmount(target)
    if (kop === null || kop <= 0) return setError('Впишите, сколько нужно накопить')
    if (hasDeadline && !deadline) return setError('Выберите дату или снимите галочку «Есть срок»')
    const input = { name, emoji, color, target: kop, deadline: hasDeadline ? deadline : undefined }
    try {
      if (goal) await updateGoal(goal.id, input)
      else await createGoal(input)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{goal ? 'Изменить цель' : 'Новая цель'}</h2>
        <CloseButton onClick={onDone} />
      </div>
      <div className="flex items-center gap-3">
        <EmojiBubble emoji={emoji} color={color} size="lg" />
        <input
          value={name}
          onChange={(e) => {
            setError('')
            setName(e.target.value)
          }}
          placeholder="На что копим?"
          aria-label="Название цели"
          className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-medium dark:bg-slate-800"
        />
      </div>
      <label className="flex items-center gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">Нужно накопить</span>
        <input
          value={target}
          onChange={(e) => {
            setError('')
            setTarget(e.target.value)
          }}
          inputMode="decimal"
          placeholder="0"
          aria-label="Сколько нужно накопить"
          className="tabular min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-right text-xl font-semibold dark:bg-slate-800"
        />
        <span className="font-semibold text-slate-400">₽</span>
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={hasDeadline} onChange={(e) => setHasDeadline(e.target.checked)} className="h-5 w-5 accent-violet-600" />
        <span className="font-medium">Есть срок</span>
        {hasDeadline && (
          <input
            type="date"
            value={deadline}
            min={todayISO()}
            onChange={(e) => setDeadline(e.target.value)}
            aria-label="Срок цели"
            className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-3 py-2 dark:bg-slate-800"
          />
        )}
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
    </div>
  )
}

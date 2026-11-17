import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { closeBudgetMonth } from '../db/repo'
import type { Category, CloseAction, Goal } from '../db/types'
import { AUTO_CLOSE_DAY, budgetFor, closeMonth, defaultActions, type BudgetContext } from '../lib/budget'
import { monthGenitive } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { celebrate, showToast } from '../lib/store'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })

const ACTIONS = [
  { type: 'carry', label: '🔁 Перенести' },
  { type: 'goal', label: '🐷 В копилку' },
  { type: 'cover', label: '🩹 Покрыть' },
  { type: 'reset', label: '🧹 Обнулить' },
] as const

/** Карточка «Итоги октября»: что сделать с остатками прошлого месяца. */
export function MonthSummaryCard({
  ctx,
  month,
  categories,
  goals,
}: {
  ctx: BudgetContext
  month: string
  categories: Map<string, Category>
  /** Копилки — куда можно отправить остаток (сначала ещё не достигнутые) */
  goals: Goal[]
}) {
  const mb = useMemo(() => budgetFor(ctx, month), [ctx, month])
  const [actions, setActions] = useState<Record<string, CloseAction>>(() => defaultActions(mb, ctx.rolloverOff))
  const [saving, setSaving] = useState(false)

  const overspent = mb.categories.filter((c) => c.left < 0)
  const result = closeMonth(mb, actions, ctx)
  const totalCarry = Object.values(result.carries).reduce((s, v) => s + v, 0)

  const setAll = (type: 'carry' | 'reset' | 'goal') => {
    const next: Record<string, CloseAction> = {}
    for (const c of mb.categories) {
      if (c.left <= 0) continue
      next[c.categoryId] = type === 'goal' ? { type: 'goal', goalId: goals[0].id } : { type }
    }
    setActions(next)
  }

  const apply = async () => {
    setSaving(true)
    try {
      const closing = await closeBudgetMonth(month, actions)
      const saved = Object.values(closing.toGoals ?? {}).reduce((sum, g) => sum + g.amount, 0)
      if (closing.achievedGoals.length > 0) celebrate()
      showToast(
        closing.achievedGoals.length > 0
          ? `🎉 Цель достигнута! Итоги ${monthGenitive(month)} подведены`
          : `✓ Итоги ${monthGenitive(month)} подведены${saved > 0 ? ` · 🐷 в копилки ${money(saved)}` : ''}`,
      )
    } catch (e) {
      showToast((e as Error).message)
      setSaving(false)
    }
  }

  const name = (id: string) => {
    const c = categories.get(id)
    return c ? `${c.emoji} ${c.name}` : '—'
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm ring-1 ring-amber-200 dark:from-amber-500/10 dark:to-orange-500/10 dark:ring-amber-500/30"
      aria-label="Итоги месяца"
    >
      <h2 className="text-lg font-bold">📊 Итоги {monthGenitive(month)}</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Потрачено {money(mb.total.spent)} из {money(mb.total.limit)}. Что сделать с остатками?
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAll('carry')} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-sm dark:bg-slate-900">
          Перенести всё
        </button>
        {goals.length > 0 && (
          <button type="button" onClick={() => setAll('goal')} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-sm dark:bg-slate-900">
            Всё в копилку
          </button>
        )}
        <button type="button" onClick={() => setAll('reset')} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-sm dark:bg-slate-900">
          Обнулить всё
        </button>
      </div>

      <ul className="mt-3 space-y-3">
        {mb.categories.map((c) => {
          const a = actions[c.categoryId]
          const carry = result.carries[c.categoryId] ?? 0
          return (
            <li key={c.categoryId} className="rounded-2xl bg-white/80 p-3 dark:bg-slate-900/60">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{name(c.categoryId)}</span>
                <span className={`tabular shrink-0 text-sm font-semibold ${c.left >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {c.left >= 0 ? `остаток ${money(c.left)}` : `перерасход ${money(-c.left)}`}
                </span>
              </div>

              {c.left > 0 && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Что сделать с остатком: ${categories.get(c.categoryId)?.name}`}>
                    {ACTIONS.filter(
                      (x) => (x.type !== 'cover' || overspent.length > 0) && (x.type !== 'goal' || goals.length > 0),
                    ).map((x) => {
                      const active = a?.type === x.type
                      return (
                        <button
                          key={x.type}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() =>
                            setActions({
                              ...actions,
                              [c.categoryId]:
                                x.type === 'cover'
                                  ? { type: 'cover', to: overspent[0].categoryId }
                                  : x.type === 'goal'
                                    ? { type: 'goal', goalId: goals[0].id }
                                    : { type: x.type },
                            })
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            active ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {x.label}
                        </button>
                      )
                    })}
                  </div>
                  {a?.type === 'goal' && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" role="radiogroup" aria-label="В какую копилку">
                      <span className="text-slate-500">в копилку:</span>
                      {goals.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          role="radio"
                          aria-checked={a.goalId === g.id}
                          onClick={() => setActions({ ...actions, [c.categoryId]: { type: 'goal', goalId: g.id } })}
                          className={`rounded-full px-2.5 py-1 font-medium ${
                            a.goalId === g.id ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300'
                          }`}
                        >
                          {g.emoji} {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {a?.type === 'cover' && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-500">чей перерасход:</span>
                      {overspent.map((o) => (
                        <button
                          key={o.categoryId}
                          type="button"
                          onClick={() => setActions({ ...actions, [c.categoryId]: { type: 'cover', to: o.categoryId } })}
                          className={`rounded-full px-2.5 py-1 font-medium ${
                            a.to === o.categoryId ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                          }`}
                        >
                          {name(o.categoryId)}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {c.left < 0 && result.covered[c.categoryId] ? `покрыто ${money(result.covered[c.categoryId])} · ` : ''}
                {result.toGoals?.[c.categoryId]
                  ? `🐷 ${money(result.toGoals[c.categoryId].amount)} — в копилку «${goals.find((g) => g.id === result.toGoals![c.categoryId].goalId)?.name}»`
                  : carry > 0
                  ? `+${money(carry)} к лимиту следующего месяца`
                  : carry < 0
                    ? `−${money(-carry)} от лимита следующего месяца`
                    : c.left < 0
                      ? 'следующий месяц начнётся без долга'
                      : 'следующий месяц — с чистого лимита'}
              </p>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={apply}
        disabled={saving}
        className="mt-4 w-full rounded-2xl bg-violet-600 py-3 font-semibold text-white disabled:opacity-60"
      >
        Применить {totalCarry > 0 ? `(перенос ${money(totalCarry)})` : ''}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
        Если ничего не выбрать, после {AUTO_CLOSE_DAY - 1}-го числа остатки перенесутся сами.
      </p>
    </motion.section>
  )
}

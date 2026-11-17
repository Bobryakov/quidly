import { Link } from 'react-router'
import type { Category } from '../db/types'
import type { MonthBudget } from '../lib/budget'
import { monthLower } from '../lib/dates'
import { formatMoney } from '../lib/format'
import { LEVEL_TEXT, ProgressBar } from './ProgressBar'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })

/** Карточка «Бюджет на ноябрь» на главной. */
export function HomeBudgetCard({ mb, categories }: { mb: MonthBudget; categories: Map<string, Category> }) {
  if (!mb.active) {
    return (
      <Link
        to="/budgets"
        className="flex items-center gap-3 rounded-3xl border-2 border-dashed border-violet-200 p-4 dark:border-violet-500/30"
      >
        <span className="text-3xl" aria-hidden>
          🎯
        </span>
        <span>
          <span className="block font-semibold">Задайте бюджет</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">и увидите, сколько ещё можно тратить в этом месяце</span>
        </span>
      </Link>
    )
  }

  // Самые «горячие» категории — по проценту
  const top = [...mb.categories].sort((a, b) => b.percent - a.percent).slice(0, 3)
  const alerts = mb.categories.filter((c) => c.level !== 'ok').length

  return (
    <Link to="/budgets" className="block rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900" aria-label="Бюджет месяца">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Бюджет на {monthLower(mb.month)}</h2>
        <span className="text-sm font-medium text-violet-600 dark:text-violet-400">Все →</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className={`tabular text-2xl font-extrabold ${LEVEL_TEXT[mb.total.level]}`}>
          {mb.total.left >= 0 ? money(mb.total.left) : `−${money(-mb.total.left)}`}
        </span>
        <span className="tabular text-sm text-slate-500 dark:text-slate-400">
          {mb.total.left >= 0 ? 'осталось' : 'перерасход'} · {money(mb.total.spent)} из {money(mb.total.limit)}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar percent={mb.total.percent} level={mb.total.level} />
      </div>

      <ul className="mt-3 space-y-2">
        {top.map((b) => {
          const c = categories.get(b.categoryId)
          return (
            <li key={b.categoryId} className="flex items-center gap-2 text-sm">
              <span aria-hidden>{c?.emoji}</span>
              <span className="w-24 shrink-0 truncate">{c?.name}</span>
              <span className="flex-1">
                <ProgressBar percent={b.percent} level={b.level} thin />
              </span>
              <span className={`tabular w-12 shrink-0 text-right text-xs font-semibold ${LEVEL_TEXT[b.level]}`}>
                {Number.isFinite(b.percent) ? `${Math.round(b.percent)}%` : '!'}
              </span>
            </li>
          )
        })}
      </ul>
      {alerts > 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          ⚠️ {alerts === 1 ? '1 категория' : alerts < 5 ? `${alerts} категории` : `${alerts} категорий`} у лимита или сверх
          него
        </p>
      )}
    </Link>
  )
}

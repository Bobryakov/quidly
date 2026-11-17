import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { EmojiBubble } from '../components/Pickers'
import { useBudgetContext, useById, useCategories, useTransactions } from '../db/hooks'
import {
  changePercent,
  forecast,
  heatmap,
  lastMonthsPeriod,
  monthlyDynamics,
  monthPeriod,
  samePeriodChange,
  spendingByCategory,
  yearPeriod,
  type Period,
} from '../lib/analytics'
import { budgetFor } from '../lib/budget'
import { isoToRu, MONTHS_NOM, monthGenitive, monthKey, monthPrepositional, monthTitle, shiftMonth, todayISO } from '../lib/dates'
import { formatMoney, plural } from '../lib/format'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })
const rub = (k: number) => formatMoney(Math.round(k / 100) * 100, { hideZeroKopecks: true })

type Mode = 'month' | '3m' | 'year'
const MODES: { value: Mode; label: string }[] = [
  { value: 'month', label: 'Месяц' },
  { value: '3m', label: '3 месяца' },
  { value: 'year', label: 'Год' },
]

const HEAT = ['bg-slate-100 dark:bg-slate-800', 'bg-violet-200 dark:bg-violet-900', 'bg-violet-300 dark:bg-violet-700', 'bg-violet-500 text-white', 'bg-fuchsia-600 text-white']
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export default function AnalyticsPage() {
  const transactions = useTransactions()
  const categories = useCategories()
  const catById = useById(categories)
  const budgetCtx = useBudgetContext()
  const navigate = useNavigate()
  const today = todayISO()
  const current = monthKey(today)
  const [mode, setMode] = useState<Mode>('month')
  const [month, setMonth] = useState(current)

  if (!transactions || !categories || !budgetCtx) return null

  const period: Period =
    mode === 'month' ? monthPeriod(month) : mode === '3m' ? lastMonthsPeriod(current, 3) : yearPeriod(Number(current.slice(0, 4)))
  const { total, items } = spendingByCategory(transactions, period)
  const dynamics = monthlyDynamics(transactions, mode === 'month' ? month : current, 6)
  const [prev, last] = dynamics.slice(-2)
  const change = changePercent(last.expense, prev.expense)
  // Текущий месяц ещё идёт — сравниваем с теми же днями прошлого
  const partial = last.month === current ? samePeriodChange(transactions, today) : null
  const heatMonth = mode === 'month' ? month : current
  const weeks = heatmap(transactions, heatMonth)
  const mb = budgetFor(budgetCtx, current)
  const fc = forecast(transactions, today, mb.active ? mb.total.limit : null)

  const openOperations = (extra: Record<string, string>) => {
    const p = new URLSearchParams(
      mode === 'month' ? { month, type: 'expense', ...extra } : { from: period.from, to: period.to, type: 'expense', ...extra },
    )
    navigate(`/operations?${p.toString()}`)
  }

  const pieData = items.map((i) => ({
    name: catById.get(i.categoryId)?.name ?? 'Без категории',
    value: i.amount,
    color: catById.get(i.categoryId)?.color ?? '#94a3b8',
  }))

  const periodLabel =
    mode === 'month' ? monthTitle(month) : mode === '3m' ? `${isoToRu(period.from)} — ${isoToRu(period.to)}` : `${current.slice(0, 4)} год`

  return (
    <>
      <PageHeader title="Аналитика" />

      {/* Период */}
      <div className="mb-3 flex rounded-2xl bg-white p-1 shadow-sm dark:bg-slate-900" role="radiogroup" aria-label="Период">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => setMode(m.value)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold ${mode === m.value ? 'bg-violet-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'month' ? (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-white px-2 py-1.5 shadow-sm dark:bg-slate-900">
          <button type="button" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))} className="h-9 w-9 text-xl">
            ‹
          </button>
          <span className="font-semibold">{periodLabel}</span>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= current}
            className="h-9 w-9 text-xl disabled:opacity-30"
          >
            ›
          </button>
        </div>
      ) : (
        <p className="mb-4 px-1 text-sm text-slate-500 dark:text-slate-400">{periodLabel}</p>
      )}

      {/* Прогноз — только для текущего месяца */}
      {(mode !== 'month' || month === current) && fc.spent > 0 && (
        <section className="mb-4 grid grid-cols-2 gap-3" aria-label="Прогноз">
          <div className="rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 p-4 text-white shadow-lg shadow-fuchsia-500/20">
            <p className="text-xs opacity-90">При таком темпе потратишь за {MONTHS_NOM[Number(current.slice(5)) - 1].toLowerCase()}</p>
            <p className="tabular mt-1 text-2xl font-extrabold">{rub(fc.projected)}</p>
            <p className="mt-1 text-xs opacity-80">
              {fc.daysPassed} из {fc.daysTotal} дней · уже {rub(fc.spent)}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
            {fc.perDay !== null ? (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">Можно тратить в день</p>
                <p className={`tabular mt-1 text-2xl font-extrabold ${fc.perDay === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {money(fc.perDay)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {fc.perDay === 0 ? 'бюджет месяца исчерпан' : `ещё ${fc.daysLeft} дн. с учётом бюджета`}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500 dark:text-slate-400">Можно тратить в день</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Задайте бюджет — и здесь появится подсказка</p>
              </>
            )}
          </div>
        </section>
      )}

      {/* Траты по категориям */}
      <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900" aria-label="Траты по категориям">
        <h2 className="mb-2 font-semibold">Траты по категориям</h2>
        {total === 0 ? (
          <EmptyState emoji="📊" title="Трат нет" hint="В этом периоде ещё ничего не потрачено" />
        ) : (
          <>
            <div className="relative mx-auto h-52 w-52">
              <PieChart width={208} height={208}>
                <Pie data={pieData} dataKey="value" innerRadius={66} outerRadius={100} paddingAngle={2} stroke="none" isAnimationActive>
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-slate-500 dark:text-slate-400">потрачено</span>
                <span className="tabular text-xl font-extrabold">{rub(total)}</span>
              </div>
            </div>
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((i) => {
                const c = catById.get(i.categoryId)
                return (
                  <li key={i.categoryId}>
                    <button
                      type="button"
                      onClick={() => openOperations({ category: i.categoryId })}
                      className="flex w-full items-center gap-3 py-2.5 text-left"
                      aria-label={`${c?.name ?? 'Без категории'}: ${money(i.amount)}`}
                    >
                      <EmojiBubble emoji={c?.emoji ?? '❔'} color={c?.color ?? '#94a3b8'} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{c?.name ?? 'Без категории'}</span>
                          <span className="tabular shrink-0 font-semibold">{money(i.amount)}</span>
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <span className="block h-full rounded-full" style={{ width: `${i.percent}%`, backgroundColor: c?.color ?? '#94a3b8' }} />
                          </span>
                          <span className="tabular w-10 text-right text-xs text-slate-500">{Math.round(i.percent)}%</span>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      {/* Динамика по месяцам */}
      <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900" aria-label="Динамика по месяцам">
        <h2 className="font-semibold">Доходы и расходы</h2>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
          {partial
            ? partial.percent === null
              ? 'Сравнивать пока не с чем'
              : `За ${partial.days} ${plural(partial.days, ['день', 'дня', 'дней'])} ${monthGenitive(current)} потрачено на ${Math.abs(Math.round(partial.percent))}% ${partial.percent >= 0 ? 'больше' : 'меньше'}, чем за те же дни прошлого месяца`
            : change === null
              ? 'Сравнивать пока не с чем'
              : `Расходы в ${monthPrepositional(last.month)} ${change >= 0 ? 'больше' : 'меньше'}, чем в прошлом месяце, на ${Math.abs(Math.round(change))}%`}
        </p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dynamics.map((d) => ({ ...d, label: MONTHS_NOM[Number(d.month.slice(5)) - 1].slice(0, 3) }))} barGap={2}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'rgba(139,92,246,0.08)' }}
                formatter={(v, name) => [rub(Number(v)), name === 'income' ? 'Доходы' : 'Расходы']}
                labelFormatter={(_, p) => (p?.[0] ? monthTitle(p[0].payload.month) : '')}
              />
              <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex justify-center gap-4 text-xs text-slate-500">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            Доходы
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-violet-500" />
            Расходы
          </span>
        </div>
      </section>

      {/* Календарь трат */}
      <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900" aria-label="Календарь трат">
        <h2 className="mb-2 font-semibold">Календарь трат · {monthTitle(heatMonth)}</h2>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEK.map((d) => (
            <span key={d} className="text-[11px] text-slate-400">
              {d}
            </span>
          ))}
          {weeks.flat().map((c, i) =>
            c ? (
              <button
                key={c.date}
                type="button"
                onClick={() => navigate(`/operations?day=${c.date}`)}
                aria-label={`${isoToRu(c.date)}: ${c.amount ? money(c.amount) : 'трат нет'}`}
                className={`aspect-square rounded-lg text-xs font-medium ${HEAT[c.level]} ${c.date === today ? 'ring-2 ring-violet-500' : ''}`}
              >
                {Number(c.date.slice(8))}
              </button>
            ) : (
              <span key={`e${i}`} />
            ),
          )}
        </div>
        <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-slate-400">
          меньше
          {HEAT.map((h, i) => (
            <span key={i} className={`h-3 w-3 rounded ${h}`} />
          ))}
          больше
        </div>
      </section>
    </>
  )
}

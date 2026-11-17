import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router'
import { withBudgetWarning } from '../db/budgetWatch'
import { markSubscriptionPaid, skipSubscriptionCharge, undoSubscriptionCharge } from '../db/repo'
import type { Category, Subscription } from '../db/types'
import { isoToRu, shortDayLabel, todayISO } from '../lib/dates'
import { formatMoney, plural } from '../lib/format'
import { showToast } from '../lib/store'
import { dueItems, monthlyTotal, relativeDay, type DueItem } from '../lib/subscriptions'
import { EmojiBubble } from './Pickers'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })

/** Плашки «Скоро спишется» на главной + короткая сводка подписок. */
export function SubscriptionDue({
  subscriptions,
  categories,
  noticeDays,
}: {
  subscriptions: Subscription[]
  categories: Map<string, Category>
  noticeDays: number
}) {
  const today = todayISO()
  const items = dueItems(subscriptions, today, noticeDays)
  const active = subscriptions.filter((s) => !s.paused)
  if (active.length === 0) return null

  const nextLater = active.find((s) => !items.some((i) => i.subscription.id === s.id))

  return (
    <section aria-label="Подписки" className="space-y-2">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={`${item.subscription.id}-${item.date}`}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 40 }}
          >
            <DueRow item={item} category={categories.get(item.subscription.categoryId)} today={today} />
          </motion.div>
        ))}
      </AnimatePresence>

      <Link to="/subscriptions" className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900">
        <span>
          🔁 Подписки: <b className="tabular">{money(Math.round(monthlyTotal(subscriptions) / 100) * 100)}</b> в месяц
          {items.length === 0 && nextLater && (
            <span className="text-slate-500 dark:text-slate-400">
              {` · ближайшая ${shortDayLabel(nextLater.nextDate, today).toLowerCase()}`}
            </span>
          )}
        </span>
        <span className="text-violet-600 dark:text-violet-400">→</span>
      </Link>
    </section>
  )
}

function DueRow({ item, category, today }: { item: DueItem; category?: Category; today: string }) {
  const s = item.subscription
  const late = item.state === 'overdue'

  const paid = async () => {
    try {
      const { result, warning } = await withBudgetWarning(s.categoryId, item.date <= today ? item.date : today, () =>
        markSubscriptionPaid(s.id, today),
      )
      showToast(`✓ ${s.name} — ${money(s.amount)} записано${warning ? ` · ${warning}` : ''}`, {
        label: 'Отменить',
        onClick: () => void undoSubscriptionCharge(s.id, result.prevNextDate, result.transactionId),
      })
    } catch (e) {
      showToast((e as Error).message)
    }
  }

  const skip = async () => {
    const prev = await skipSubscriptionCharge(s.id)
    showToast(`⏭ ${s.name}: списание ${isoToRu(prev)} пропущено`, {
      label: 'Отменить',
      onClick: () => void undoSubscriptionCharge(s.id, prev),
    })
  }

  return (
    <div
      className={`rounded-2xl p-3 shadow-sm ${
        late
          ? 'bg-rose-50 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:ring-rose-500/30'
          : 'bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30'
      }`}
      role="group"
      aria-label={`Подписка ${s.name}`}
    >
      <div className="flex items-center gap-3">
        <EmojiBubble emoji={category?.emoji ?? '🔁'} color={category?.color ?? '#0ea5e9'} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {s.name} · <span className="tabular">{money(s.amount)}</span>
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {late
              ? `Списалось ${isoToRu(item.date)}?`
              : item.state === 'today'
                ? 'Спишется сегодня'
                : `Скоро спишется · ${relativeDay(item.inDays)}`}
            {item.moreMissed > 0 && (
              <span className="text-rose-600 dark:text-rose-400">
                {' '}
                · и ещё {item.moreMissed}{' '}
                {plural(item.moreMissed, ['пропущенное списание', 'пропущенных списания', 'пропущенных списаний'])}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={paid} className="flex-1 rounded-xl bg-violet-600 py-2 text-sm font-semibold text-white active:bg-violet-700">
          ✓ Проведено
        </button>
        {(late || item.state === 'today') && (
          <button type="button" onClick={skip} className="rounded-xl bg-white px-4 py-2 text-sm font-medium dark:bg-slate-800">
            Пропустить
          </button>
        )}
      </div>
    </div>
  )
}

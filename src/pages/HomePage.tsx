import { useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { formatDate, formatMoney } from '../lib/format'

export function HomePage() {
  // На этапе 1 данных ещё нет — показываем нулевой баланс.
  const total = 0
  const [today] = useState(() => new Date())

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Quidly</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">{formatDate(today)}</span>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 p-6 text-white shadow-lg shadow-fuchsia-500/20">
        <p className="text-sm font-medium opacity-90">Общий баланс</p>
        <p className="tabular mt-1 text-4xl font-extrabold">{formatMoney(total)}</p>
        <p className="mt-3 text-sm opacity-80">по всем счетам</p>
      </section>

      <EmptyState emoji="🌱" title="Пока пусто" hint="Нажми ➕, чтобы добавить первую трату" />
    </div>
  )
}

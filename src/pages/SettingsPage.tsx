import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { useTheme, type ThemeChoice } from '../lib/theme'

const THEMES: { value: ThemeChoice; label: string; emoji: string }[] = [
  { value: 'light', label: 'Светлая', emoji: '☀️' },
  { value: 'dark', label: 'Тёмная', emoji: '🌙' },
  { value: 'system', label: 'Как в системе', emoji: '📱' },
]

const READY = [
  { to: '/settings/accounts', emoji: '💳', label: 'Счета' },
  { to: '/settings/categories', emoji: '🏷️', label: 'Категории' },
  { to: '/budgets', emoji: '🎯', label: 'Бюджеты' },
  { to: '/subscriptions', emoji: '🔁', label: 'Подписки' },
  { to: '/import', emoji: '📥', label: 'Импорт выписки' },
  { to: '/settings/import-rules', emoji: '🪄', label: 'Правила импорта' },
]

const DATA = [
  { to: '/settings/security', emoji: '🔒', label: 'PIN и блокировка' },
  { to: '/settings/backup', emoji: '💾', label: 'Резервная копия' },
  { to: '/settings/export', emoji: '📤', label: 'Экспорт в Excel / CSV' },
]

function LinkList({ items }: { items: { to: string; emoji: string; label: string }[] }) {
  return (
    <section className="mb-4 rounded-3xl bg-white px-5 py-1 shadow-sm dark:bg-slate-900">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="flex items-center gap-3 py-3.5 font-medium">
              <span className="text-xl" aria-hidden>
                {item.emoji}
              </span>
              <span className="flex-1">{item.label}</span>
              <span className="text-slate-400" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SettingsPage() {
  const { choice, setChoice } = useTheme()

  return (
    <>
      <PageHeader title="Настройки" />

      <LinkList items={READY} />
      <LinkList items={DATA} />

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <h2 className="mb-3 font-semibold">Тема</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Тема оформления">
          {THEMES.map((t) => {
            const active = choice === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChoice(t.value)}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                    : 'border-transparent bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {t.emoji}
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </section>

      <p className="px-2 text-center text-sm text-slate-500 dark:text-slate-400">
        🔐 Все данные хранятся только на этом устройстве. Никаких серверов и регистрации.
      </p>
    </>
  )
}

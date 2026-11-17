import { PageHeader } from '../components/PageHeader'
import { useTheme, type ThemeChoice } from '../lib/theme'

const THEMES: { value: ThemeChoice; label: string; emoji: string }[] = [
  { value: 'light', label: 'Светлая', emoji: '☀️' },
  { value: 'dark', label: 'Тёмная', emoji: '🌙' },
  { value: 'system', label: 'Как в системе', emoji: '📱' },
]

const COMING_SOON = [
  { emoji: '💳', label: 'Счета и категории', stage: 2 },
  { emoji: '🎯', label: 'Бюджеты', stage: 3 },
  { emoji: '🔁', label: 'Подписки', stage: 4 },
  { emoji: '📥', label: 'Импорт выписок', stage: 7 },
  { emoji: '🔒', label: 'PIN и автоблокировка', stage: 8 },
  { emoji: '💾', label: 'Экспорт и бэкап', stage: 8 },
]

export function SettingsPage() {
  const { choice, setChoice } = useTheme()

  return (
    <>
      <PageHeader title="Настройки" />

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

      <section className="mb-4 rounded-3xl bg-white p-5 shadow-sm dark:bg-slate-900">
        <h2 className="mb-2 font-semibold">Скоро</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {COMING_SOON.map((item) => (
            <li key={item.label} className="flex items-center gap-3 py-3 text-slate-400 dark:text-slate-500">
              <span className="text-xl grayscale" aria-hidden>
                {item.emoji}
              </span>
              <span className="flex-1">{item.label}</span>
              <span className="text-xs">этап {item.stage}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="px-2 text-center text-sm text-slate-500 dark:text-slate-400">
        🔐 Все данные хранятся только на этом устройстве. Никаких серверов и регистрации.
      </p>
    </>
  )
}

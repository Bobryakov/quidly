import { NavLink } from 'react-router'

const NAV_ITEMS = [
  { to: '/', label: 'Главная', emoji: '🏠' },
  { to: '/operations', label: 'Операции', emoji: '📋' },
  { to: '/analytics', label: 'Аналитика', emoji: '📊' },
  { to: '/goals', label: 'Цели', emoji: '🐷' },
  { to: '/settings', label: 'Настройки', emoji: '⚙️' },
] as const

export function BottomNav() {
  return (
    <nav
      aria-label="Основное меню"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-violet-100 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg">
        {NAV_ITEMS.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={`text-2xl leading-none transition-transform ${isActive ? 'scale-110' : 'opacity-70 grayscale'}`}
                  >
                    {item.emoji}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

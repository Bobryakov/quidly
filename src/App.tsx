import { HashRouter, Route, Routes } from 'react-router'
import { BottomNav } from './components/BottomNav'
import { QuickAdd } from './components/QuickAdd'
import { HomePage } from './pages/HomePage'
import { AnalyticsPage, GoalsPage, OperationsPage } from './pages/PlaceholderPages'
import { SettingsPage } from './pages/SettingsPage'
import { useApplyTheme } from './lib/theme'

// HashRouter: адреса экранов вида /quidly/#/settings.
// Так GitHub Pages не выдаёт «страница не найдена» при обновлении экрана.
export function AppRoutes() {
  // Подключаем тему на уровне всего приложения, чтобы она следила за системной
  useApplyTheme()

  return (
    <>
      <main
        className="mx-auto max-w-lg px-4 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 160px)' }}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/operations" element={<OperationsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <QuickAdd />
      <BottomNav />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}

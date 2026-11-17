import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { BottomNav } from './components/BottomNav'
import { QuickAddButton, QuickAddSheet } from './components/QuickAdd'
import { ToastHost } from './components/ToastHost'
import { useAccounts } from './db/hooks'
import { BudgetsPage } from './pages/BudgetsPage'
import { HomePage } from './pages/HomePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { OperationsPage } from './pages/OperationsPage'
import { AnalyticsPage, GoalsPage } from './pages/PlaceholderPages'
import { SettingsPage } from './pages/SettingsPage'
import { SubscriptionsPage } from './pages/SubscriptionsPage'
import { AccountsPage } from './pages/settings/AccountsPage'
import { CategoriesPage } from './pages/settings/CategoriesPage'
import { useApplyTheme } from './lib/theme'

// HashRouter: адреса экранов вида /quidly/#/settings.
// Так GitHub Pages не выдаёт «страница не найдена» при обновлении экрана.
export function AppRoutes() {
  // Подключаем тему на уровне всего приложения, чтобы она следила за системной
  useApplyTheme()
  const accounts = useAccounts()
  const { pathname } = useLocation()

  // При переходе между экранами — наверх
  // (фигурные скобки важны: в новых Chrome scrollTo возвращает Promise, а React ждёт от эффекта функцию или ничего)
  useEffect(() => {
    window.scrollTo?.(0, 0)
  }, [pathname])

  if (accounts === undefined) return null // база ещё открывается — доли секунды
  if (accounts.length === 0) {
    return (
      <>
        <OnboardingPage />
        <ToastHost />
      </>
    )
  }

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
          <Route path="/settings/accounts" element={<AccountsPage />} />
          <Route path="/settings/categories" element={<CategoriesPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <QuickAddButton />
      <BottomNav />
      <QuickAddSheet />
      <ToastHost />
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

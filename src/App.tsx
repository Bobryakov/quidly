import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation } from 'react-router'
import { BottomNav } from './components/BottomNav'
import { ConfirmHost } from './components/ConfirmHost'
import { Confetti } from './components/Confetti'
import { LockGate } from './components/LockGate'
import { QuickAddButton, QuickAddSheet } from './components/QuickAdd'
import { ToastHost } from './components/ToastHost'
import { useAccounts } from './db/hooks'
import { BudgetsPage } from './pages/BudgetsPage'
import { HomePage } from './pages/HomePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { OperationsPage } from './pages/OperationsPage'
import { GoalsPage } from './pages/GoalsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SubscriptionsPage } from './pages/SubscriptionsPage'
import { AccountsPage } from './pages/settings/AccountsPage'
import { CategoriesPage } from './pages/settings/CategoriesPage'
import { BackupPage } from './pages/settings/BackupPage'
import { ImportRulesPage } from './pages/settings/ImportRulesPage'
import { SecurityPage } from './pages/settings/SecurityPage'
import { useApplyTheme } from './lib/theme'

// Графики — тяжёлая библиотека, поэтому экран аналитики загружается, только когда его открывают
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
// Импорт тянет библиотеки чтения PDF и Excel — тоже грузится только при открытии
const ImportPage = lazy(() => import('./pages/ImportPage'))
// Экспорт тоже использует библиотеку Excel
const ExportPage = lazy(() => import('./pages/settings/ExportPage'))

/** Экраны, где есть кнопка «+» (в «Настройках» она закрывала выбор темы, а добавлять трату оттуда незачем). */
const MAIN_SCREENS = ['/', '/operations', '/analytics', '/goals']

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
          <Route
            path="/analytics"
            element={
              <Suspense fallback={null}>
                <AnalyticsPage />
              </Suspense>
            }
          />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/accounts" element={<AccountsPage />} />
          <Route path="/settings/categories" element={<CategoriesPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route
            path="/import"
            element={
              <Suspense fallback={null}>
                <ImportPage />
              </Suspense>
            }
          />
          <Route path="/settings/import-rules" element={<ImportRulesPage />} />
          <Route path="/settings/security" element={<SecurityPage />} />
          <Route path="/settings/backup" element={<BackupPage />} />
          <Route
            path="/settings/export"
            element={
              <Suspense fallback={null}>
                <ExportPage />
              </Suspense>
            }
          />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      {/* «+» — только на основных экранах; на остальных он мешает */}
      {MAIN_SCREENS.includes(pathname) && <QuickAddButton />}
      <BottomNav />
      <QuickAddSheet />
      <ToastHost />
      <ConfirmHost />
      <Confetti />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <LockGate>
        <AppRoutes />
      </LockGate>
    </HashRouter>
  )
}

import { useEffect, useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

// Выбор темы — это настройка интерфейса, а не финансовые данные,
// поэтому она хранится в localStorage: так тема ставится мгновенно при запуске.
const KEY = 'quidly-theme'

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // localStorage может быть недоступен — используем системную тему
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#020617' : '#7c3aed')
}

// Одно общее значение на всё приложение
let current: ThemeChoice | null = null
const listeners = new Set<() => void>()

function getChoice(): ThemeChoice {
  if (current === null) current = readChoice()
  return current
}

export function setTheme(next: ThemeChoice) {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // не страшно: тема просто не запомнится
  }
  current = next
  apply(next)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Текущий выбор темы и функция смены. */
export function useTheme() {
  const choice = useSyncExternalStore(subscribe, getChoice)
  return { choice, setChoice: setTheme }
}

/** Подключается один раз в корне: применяет тему и следит за системной. */
export function useApplyTheme() {
  const choice = useSyncExternalStore(subscribe, getChoice)
  useEffect(() => {
    apply(choice)
    if (choice !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])
}

/** Только для тестов: сбросить запомненное значение. */
export function resetThemeForTests() {
  current = null
}

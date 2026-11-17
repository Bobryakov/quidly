import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// В тестах вместо настоящей базы браузера — её копия в памяти (fake-indexeddb).

// Ждём появления элементов на экране до 5 секунд (по умолчанию — 1 секунда,
// на медленном компьютере страницы, которые грузятся отдельно, не успевают)
configure({ asyncUtilTimeout: 5000 })

// Убираем отрисованный экран после каждого теста
afterEach(() => cleanup())

// Графикам (Recharts) нужен ResizeObserver, которого нет в тестовом «браузере»
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

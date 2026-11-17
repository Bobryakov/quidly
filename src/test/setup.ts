import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// В тестах вместо настоящей базы браузера — её копия в памяти (fake-indexeddb).

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

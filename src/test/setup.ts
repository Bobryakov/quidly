import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// В тестах вместо настоящей базы браузера — её копия в памяти (fake-indexeddb).

// Убираем отрисованный экран после каждого теста
afterEach(() => cleanup())

import { useSyncExternalStore } from 'react'

/** Крошечное общее хранилище состояния интерфейса (не данных!). */
export function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : next
      listeners.forEach((l) => l())
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    use(): T {
      return useSyncExternalStore(this.subscribe, this.get)
    },
  }
}

// ---------- панель быстрого ввода ----------

export type QuickAddState = { open: false } | { open: true; editId?: string; nonce: number }

export const quickAdd = createStore<QuickAddState>({ open: false })

let openCounter = 0

export function openQuickAdd(editId?: string) {
  // Плашка «Записано» не должна закрывать категории в только что открытой панели
  hideToast()
  // Номер открытия: каждое открытие — новая пустая форма (не время: два открытия в одну миллисекунду совпали бы)
  quickAdd.set({ open: true, editId, nonce: ++openCounter })
}

export function closeQuickAdd() {
  quickAdd.set({ open: false })
}

// ---------- всплывающие плашки ----------

export type Toast = {
  id: number
  text: string
  action?: { label: string; onClick: () => void }
}

export const toasts = createStore<Toast | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

export function showToast(text: string, action?: Toast['action'], ms = action ? 5000 : 2200) {
  clearTimeout(toastTimer)
  const toast = { id: Date.now(), text, action }
  toasts.set(toast)
  toastTimer = setTimeout(() => {
    if (toasts.get()?.id === toast.id) toasts.set(null)
  }, ms)
}

export function hideToast() {
  clearTimeout(toastTimer)
  toasts.set(null)
}

// ---------- конфетти ----------

/** Номер «праздника»: каждое увеличение запускает конфетти. */
export const celebration = createStore(0)

export function celebrate() {
  celebration.set((n) => n + 1)
}

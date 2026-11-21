import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { createStore } from '../lib/store'

type Request = {
  id: number
  title: string
  text?: string
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

const confirmStore = createStore<Request | null>(null)
let counter = 0

/**
 * Красивое окно «Вы уверены?» вместо системного серого окна браузера.
 * Пример: if (!(await askConfirm({ title: 'Удалить счёт «Карта»?', confirmLabel: 'Удалить' }))) return
 */
export function askConfirm(opts: { title: string; text?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  confirmStore.get()?.resolve(false)
  return new Promise((resolve) =>
    confirmStore.set({ id: ++counter, title: opts.title, text: opts.text, confirmLabel: opts.confirmLabel ?? 'Да', danger: opts.danger ?? true, resolve }),
  )
}

export function ConfirmHost() {
  const req = confirmStore.use()
  const okRef = useRef<HTMLButtonElement>(null)

  const answer = (ok: boolean) => {
    req?.resolve(ok)
    confirmStore.set(null)
  }

  useEffect(() => {
    if (!req) return
    okRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req?.id])

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          key={req.id}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => answer(false)}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900"
            initial={{ y: 40, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-lg font-bold">
              {req.title}
            </h2>
            {req.text && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{req.text}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => answer(false)} className="rounded-2xl bg-slate-100 py-3 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Отмена
              </button>
              <button
                ref={okRef}
                type="button"
                onClick={() => answer(true)}
                className={`rounded-2xl py-3 font-semibold text-white ${req.danger ? 'bg-rose-600' : 'bg-violet-600'}`}
              >
                {req.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

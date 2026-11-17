import { AnimatePresence, motion } from 'framer-motion'
import { hideToast, toasts } from '../lib/store'

/** Плашка внизу экрана: «Записано», «Удалено · Отменить» и т. п. */
export function ToastHost() {
  const toast = toasts.use()

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 152px)' }}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl dark:bg-slate-700"
          >
            <span className="flex-1">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick()
                  hideToast()
                }}
                className="font-semibold text-amber-300"
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

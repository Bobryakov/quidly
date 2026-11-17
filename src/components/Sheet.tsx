import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}

/** Панель, выезжающая снизу. Закрывается тапом по затемнению или кнопкой ✕. */
export function Sheet({ open, onClose, label, children }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 dark:bg-slate-900"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Закрыть"
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
    >
      ✕
    </button>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'

/**
 * Круглая кнопка «+» над нижним меню и всплывающая панель быстрого ввода.
 * На этапе 1 панель — заглушка; клавиатура и категории появятся на этапе 2.
 */
export function QuickAdd() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <motion.button
        type="button"
        aria-label="Добавить операцию"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.9 }}
        className="fixed right-5 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-4xl font-light text-white shadow-lg shadow-pink-500/30"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
      >
        +
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Быстрый ввод"
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl bg-white p-6 pb-10 text-center dark:bg-slate-900"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="mb-3 text-6xl" aria-hidden>
                🚧
              </div>
              <p className="text-lg font-semibold">Быстрый ввод скоро появится</p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                Здесь будет крупная клавиатура и категории: «+» → сумма → категория — готово.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-6 w-full rounded-2xl bg-violet-600 py-3 font-semibold text-white active:bg-violet-700"
              >
                Понятно
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

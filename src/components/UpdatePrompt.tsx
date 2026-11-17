import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Плашка «Вышла новая версия». Новая версия включается только по нажатию,
 * чтобы приложение не перезагрузилось посреди ввода траты.
 * Данные при обновлении не теряются: они лежат в базе на устройстве.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white shadow-xl dark:bg-violet-600"
    >
      <span className="text-2xl" aria-hidden>
        ✨
      </span>
      <span className="flex-1 text-sm">Вышла новая версия Quidly</span>
      <button type="button" onClick={() => setNeedRefresh(false)} className="px-2 text-sm opacity-70">
        Позже
      </button>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-slate-900"
      >
        Обновить
      </button>
    </div>
  )
}

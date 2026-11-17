import type { KeypadKey } from '../lib/amount'

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back']

/** Крупная цифровая клавиатура для ввода суммы. */
export function Keypad({ onKey }: { onKey: (key: KeypadKey) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Клавиатура суммы">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k === 'back' ? 'Стереть' : k === ',' ? 'Запятая' : k}
          onClick={() => onKey(k)}
          className="h-13 rounded-2xl bg-slate-100 text-2xl font-semibold text-slate-800 transition-colors select-none active:bg-violet-200 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-violet-500/40"
        >
          {k === 'back' ? '⌫' : k}
        </button>
      ))}
    </div>
  )
}

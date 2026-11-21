import { motion } from 'framer-motion'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

type Props = {
  onDigit: (d: string) => void
  onBack: () => void
  /** Кнопка отпечатка слева от нуля (если вход по отпечатку включён) */
  onBiometric?: () => void
  disabled?: boolean
  /** Светлые кнопки на цветном фоне экрана блокировки */
  onColor?: boolean
}

/** Клавиатура для PIN-кода. */
export function PinPad({ onDigit, onBack, onBiometric, disabled, onColor }: Props) {
  const key = onColor
    ? 'bg-white/20 text-white active:bg-white/40'
    : 'bg-slate-100 text-slate-800 active:bg-violet-200 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-violet-500/40'
  const cls = `h-16 rounded-2xl text-2xl font-semibold transition-colors select-none disabled:opacity-40 ${key}`
  return (
    <div className="grid grid-cols-3 gap-3" role="group" aria-label="Клавиатура PIN-кода">
      {DIGITS.map((d) => (
        <button key={d} type="button" className={cls} disabled={disabled} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      {onBiometric ? (
        <button type="button" className={cls} aria-label="Войти по отпечатку или лицу" onClick={onBiometric}>
          👆
        </button>
      ) : (
        <span />
      )}
      <button type="button" className={cls} disabled={disabled} onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className={cls} aria-label="Стереть" disabled={disabled} onClick={onBack}>
        ⌫
      </button>
    </div>
  )
}

/** Кружки: сколько цифр введено. `shake` — покачать при ошибке. */
export function PinDots({ filled, total, shake, onColor }: { filled: number; total: number; shake?: number; onColor?: boolean }) {
  return (
    <motion.div
      key={shake}
      className="flex justify-center gap-4"
      aria-label={`Введено цифр: ${filled}`}
      animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : undefined}
      transition={{ duration: 0.4 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-4 w-4 rounded-full border-2 ${
            onColor
              ? i < filled
                ? 'border-white bg-white'
                : 'border-white/70'
              : i < filled
                ? 'border-violet-500 bg-violet-500'
                : 'border-slate-300 dark:border-slate-600'
          }`}
        />
      ))}
    </motion.div>
  )
}

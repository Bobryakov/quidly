import { motion } from 'framer-motion'
import type { Level } from '../lib/budget'

const COLORS: Record<Level, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-400',
  over: 'bg-rose-500',
}

/** Полоска бюджета: зелёная < 80%, жёлтая 80–100%, красная > 100%. */
export function ProgressBar({ percent, level, thin = false }: { percent: number; level: Level; thin?: boolean }) {
  const width = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 100))
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${thin ? 'h-1.5' : 'h-2.5'}`}
      role="progressbar"
      aria-valuenow={Number.isFinite(percent) ? Math.round(percent) : 100}
      aria-valuemin={0}
      aria-valuemax={100}
      data-level={level}
    >
      <motion.div
        className={`h-full rounded-full ${COLORS[level]}`}
        initial={{ width: 0 }}
        animate={{ width: `${width}%` }}
        transition={{ type: 'spring', damping: 25, stiffness: 120 }}
      />
    </div>
  )
}

export const LEVEL_TEXT: Record<Level, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  over: 'text-rose-600 dark:text-rose-400',
}

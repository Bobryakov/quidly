import { useState } from 'react'
import { COLORS, EMOJIS } from '../db/seed'

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цвет">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={`h-9 w-9 rounded-full transition-transform ${value === c ? 'scale-110 ring-4 ring-violet-300 dark:ring-violet-500/60' : ''}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [custom, setCustom] = useState('')
  return (
    <div>
      <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Эмодзи">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={value === e}
            onClick={() => onChange(e)}
            className={`h-10 rounded-xl text-2xl ${value === e ? 'bg-violet-100 dark:bg-violet-500/25' : ''}`}
          >
            {e}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        Своя эмодзи:
        <input
          value={custom}
          onChange={(ev) => {
            setCustom(ev.target.value)
            const first = [...new Intl.Segmenter().segment(ev.target.value.trim())][0]?.segment
            if (first) onChange(first)
          }}
          className="w-20 rounded-xl bg-slate-100 px-3 py-2 text-xl dark:bg-slate-800"
          aria-label="Своя эмодзи"
        />
      </label>
    </div>
  )
}

/** Кружок с эмодзи на цветном фоне. */
export function EmojiBubble({ emoji, color, size = 'md' }: { emoji: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-14 w-14 text-3xl' : size === 'sm' ? 'h-9 w-9 text-lg' : 'h-11 w-11 text-2xl'
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-2xl ${cls}`}
      style={{ backgroundColor: `${color}26` }}
    >
      {emoji}
    </span>
  )
}

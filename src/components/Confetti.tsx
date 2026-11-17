import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { celebration } from '../lib/store'

const COLORS = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899']

/** Конфетти на весь экран на пару секунд — когда цель достигнута. */
export function Confetti() {
  const n = celebration.use()
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (n === 0) return
    setShown(n)
    const t = setTimeout(() => setShown(0), 2600)
    return () => clearTimeout(t)
  }, [n])

  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        drift: (Math.random() - 0.5) * 30,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 0.9,
        rotate: Math.random() * 720 - 360,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      })),
    // новый набор на каждый праздник
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown],
  )

  if (!shown) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden data-testid="confetti">
      {pieces.map((p) => (
        <motion.span
          key={`${shown}-${p.id}`}
          className="absolute top-0 block"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            backgroundColor: p.color,
            borderRadius: p.round ? '9999px' : '2px',
          }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: `${p.drift}vw`, rotate: p.rotate, opacity: [1, 1, 0.8] }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}

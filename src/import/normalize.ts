// Мелкие помощники для разбора выписок.

/** «1 234,56», «+300,00», «-1234.5», «1 900» → копейки (всегда ≥ 0) или null. */
export function parseBankAmount(text: string): number | null {
  const s = text.replace(/[\s  ₽]|руб\.?|RUB/gi, '').replace('−', '-')
  const m = s.match(/^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  return Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'))
}

/** Знак суммы: true — отрицательная («-500», «−500»). */
export function isNegativeAmount(text: string): boolean {
  return /^\s*[-−]/.test(text)
}

/**
 * Дата из выписки → 'ГГГГ-ММ-ДД'. Понимает «17.11.2026», «17.11.26», «2026-11-17»,
 * «17.11.2026 16:29», «17/11/2026», а также числа-даты Excel. null — не похоже на дату.
 */
export function parseBankDate(value: unknown): string | null {
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    // дата Excel: дни от 30.12.1899
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    return `${y}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  const s = String(value ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:\D|$)/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return valid(y, +m[2], +m[1])
  }
  return null
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  const date = new Date(y, m - 1, d)
  if (date.getMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Время «16:29» или «16:29:05» из строки, если есть. */
export function parseBankTime(value: unknown): string | undefined {
  const m = String(value ?? '').match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined
}

/**
 * «Ключ продавца» для правил автокатегорий: без номеров магазинов, городов и служебных слов.
 * «PYATEROCHKA 8813 MOSCOW RUS» → «PYATEROCHKA», «YANDEX*5814*EDA MOSCOW RUS» → «YANDEX EDA».
 */
export function merchantKey(description: string): string {
  return description
    .toUpperCase()
    .replace(/\.\s*ОПЕРАЦИЯ ПО (КАРТЕ|СЧЕТУ|СЧЁТУ).*$/u, '')
    .replace(/\b(MOSCOW|MOSKVA|MOSKOW|SANKT-PETERBURG|ST PETERSBURG|SPB|RUS|RU|RUSSIA|G)\b/g, ' ')
    .replace(/[*№#_\-.,"'()/\\]+/g, ' ')
    .replace(/\b[A-ZА-ЯЁ]?\d+[A-ZА-ЯЁ]?\b/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

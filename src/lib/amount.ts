// Ввод суммы: с собственной клавиатуры и из обычного текстового поля.

/** Максимум 9 цифр в рублях (до 999 999 999 ₽) — защита от случайных лишних нажатий. */
const MAX_RUB_DIGITS = 9

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | 'back'

/**
 * Обрабатывает нажатие клавиши. Строка хранится в виде «1234,5».
 * Неподходящие нажатия (вторая запятая, третья цифра копеек и т. п.) игнорируются.
 */
export function pressKey(value: string, key: KeypadKey): string {
  if (key === 'back') return value.slice(0, -1)

  const [rub, kop] = value.split(',')
  if (key === ',') {
    if (value.includes(',')) return value
    return (value === '' ? '0' : value) + ','
  }
  // цифра
  if (kop !== undefined) {
    return kop.length >= 2 ? value : value + key
  }
  if (rub === '0') return key // «0» → «5», без ведущих нулей
  if (rub.length >= MAX_RUB_DIGITS) return value
  return value + key
}

/** «1234,5» → 123450 копеек. Пустая строка → 0. */
export function keypadToKopecks(value: string): number {
  if (value === '') return 0
  const [rub, kop = ''] = value.split(',')
  return Number(rub || '0') * 100 + Number(kop.padEnd(2, '0'))
}

/** 123450 → «1234,5» (для редактирования уже сохранённой суммы). */
export function kopecksToKeypad(kopecks: number): string {
  const rub = Math.floor(kopecks / 100)
  const kop = kopecks % 100
  if (kop === 0) return String(rub)
  return `${rub},${String(kop).padStart(2, '0').replace(/0$/, '')}`
}

/** Для показа во время ввода: «1234,5» → «1 234,5». */
export function displayKeypad(value: string): string {
  const [rub, kop] = value.split(',')
  const grouped = (rub || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return kop === undefined ? grouped : `${grouped},${kop}`
}

/**
 * Разбирает сумму, введённую текстом: «12 345,67», «12345.6», «-500», «1 000 ₽».
 * Возвращает копейки или null, если это не число.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text
    .replace(/[\s  ₽]/g, '')
    .replace('−', '-')
    .replace(',', '.')
  if (cleaned === '' ) return 0
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const negative = cleaned.startsWith('-')
  const [rub, kop = ''] = cleaned.replace('-', '').split('.')
  const value = Number(rub) * 100 + Number(kop.padEnd(2, '0'))
  return negative ? -value : value
}

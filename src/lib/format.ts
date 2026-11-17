// Форматы из SPEC: деньги «1 234,56 ₽», даты «ДД.ММ.ГГГГ».
// Суммы везде хранятся в копейках (целые числа).

const NBSP = ' '

/** Разбивает целую часть на разряды неразрывным пробелом: 1234567 → «1 234 567». */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

/**
 * Копейки → «1 234,56 ₽».
 * По умолчанию копейки показываются всегда; с `{ hideZeroKopecks: true }`
 * круглые суммы пишутся без них: «1 234 ₽».
 */
export function formatMoney(kopecks: number, opts: { hideZeroKopecks?: boolean } = {}): string {
  if (!Number.isInteger(kopecks)) {
    throw new Error(`Сумма должна быть в копейках (целое число), получено: ${kopecks}`)
  }
  const sign = kopecks < 0 ? '−' : ''
  const abs = Math.abs(kopecks)
  const rub = Math.floor(abs / 100)
  const kop = abs % 100
  const kopPart = opts.hideZeroKopecks && kop === 0 ? '' : ',' + String(kop).padStart(2, '0')
  return `${sign}${groupDigits(rub)}${kopPart}${NBSP}₽`
}

/** Дата → «ДД.ММ.ГГГГ» (по местному времени устройства). */
export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${d}.${m}.${date.getFullYear()}`
}

/** Номер дня недели, где понедельник = 0, воскресенье = 6. */
export function weekdayMondayFirst(date: Date): number {
  return (date.getDay() + 6) % 7
}

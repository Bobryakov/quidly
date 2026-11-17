// Даты операций хранятся строкой 'ГГГГ-ММ-ДД' по местному времени устройства.

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
export const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(now = new Date()): string {
  return toISODate(now)
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** 'ГГГГ-ММ-ДД' → 'ДД.ММ.ГГГГ' */
export function isoToRu(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** Заголовок дня в списке: «Сегодня», «Вчера» или «15 ноября, воскресенье» (+ год, если не текущий). */
export function dayTitle(iso: string, today = todayISO()): string {
  if (iso === today) return 'Сегодня'
  if (iso === addDays(today, -1)) return 'Вчера'
  const d = fromISODate(iso)
  const year = d.getFullYear() !== fromISODate(today).getFullYear() ? ` ${d.getFullYear()}` : ''
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${year}, ${WEEKDAYS[d.getDay()]}`
}

/** Короткая подпись для кнопки даты: «Сегодня», «Вчера» или «15 ноября». */
export function shortDayLabel(iso: string, today = todayISO()): string {
  if (iso === today) return 'Сегодня'
  if (iso === addDays(today, -1)) return 'Вчера'
  const d = fromISODate(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

/** Месяц в виде 'ГГГГ-ММ' */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS_NOM[m - 1]} ${y}`
}

/** 'ГГГГ-ММ' → «октября» (для «Итоги октября») */
export function monthGenitive(key: string): string {
  return MONTHS_GEN[Number(key.slice(5, 7)) - 1]
}

/** 'ГГГГ-ММ' → «ноябрь» (для «Бюджет на ноябрь») */
export function monthLower(key: string): string {
  return MONTHS_NOM[Number(key.slice(5, 7)) - 1].toLowerCase()
}

/** 'ГГГГ-ММ' → «ноябре» (для «в ноябре») */
export function monthPrepositional(key: string): string {
  return monthGenitive(key).replace(/[ая]$/, 'е')
}

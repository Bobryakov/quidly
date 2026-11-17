// Расчёты подписок. Чистые функции, покрыты тестами.

import type { Subscription, SubscriptionPeriod } from '../db/types'
import { addDays, fromISODate, toISODate } from './dates'

export const PERIODS: Record<SubscriptionPeriod, { label: string; per: string; months: number }> = {
  week: { label: 'Неделя', per: 'в неделю', months: 0 },
  month: { label: 'Месяц', per: 'в месяц', months: 1 },
  quarter: { label: 'Квартал', per: 'в квартал', months: 3 },
  year: { label: 'Год', per: 'в год', months: 12 },
}

/** Варианты «за сколько дней напоминать» */
export const NOTICE_DAYS_OPTIONS = [1, 3, 7] as const
export const DEFAULT_NOTICE_DAYS = 3

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/**
 * Дата следующего списания после `date`.
 * Для месяцев/кварталов/лет число берётся из `anchorDay`, а если такого числа в месяце нет —
 * последний день месяца (31-е → 28/29 февраля → 31 марта).
 */
export function nextChargeDate(date: string, period: SubscriptionPeriod, anchorDay: number): string {
  if (period === 'week') return addDays(date, 7)
  const d = fromISODate(date)
  const targetMonth = d.getMonth() + PERIODS[period].months
  const year = d.getFullYear() + Math.floor(targetMonth / 12)
  const month = ((targetMonth % 12) + 12) % 12
  const day = Math.min(anchorDay, daysInMonth(year, month))
  return toISODate(new Date(year, month, day))
}

/** Сколько подписка стоит в пересчёте на месяц (копейки, округлено). */
export function monthlyEquivalent(amount: number, period: SubscriptionPeriod): number {
  switch (period) {
    case 'week':
      return Math.round((amount * 52) / 12)
    case 'month':
      return amount
    case 'quarter':
      return Math.round(amount / 3)
    case 'year':
      return Math.round(amount / 12)
  }
}

export function monthlyTotal(subs: Subscription[]): number {
  return subs.filter((s) => !s.paused).reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.period), 0)
}

/** Разница в днях между датами 'ГГГГ-ММ-ДД' (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000)
}

export type DueState = 'overdue' | 'today' | 'soon'

export interface DueItem {
  subscription: Subscription
  date: string
  state: DueState
  /** Через сколько дней (0 — сегодня, < 0 — сколько дней назад) */
  inDays: number
  /** Сколько ещё пропущенных списаний после этого (если долго не открывали приложение) */
  moreMissed: number
}

/**
 * Что показать в плашке «Скоро спишется»: по одной строке на подписку —
 * ближайшее неотмеченное списание, если оно уже прошло, сегодня или в ближайшие `noticeDays` дней.
 */
export function dueItems(subs: Subscription[], today: string, noticeDays: number): DueItem[] {
  const items: DueItem[] = []
  for (const s of subs) {
    if (s.paused) continue
    const inDays = daysBetween(today, s.nextDate)
    if (inDays > noticeDays) continue
    let moreMissed = 0
    if (inDays < 0) {
      // сколько ещё списаний после этого тоже уже прошло (≤ сегодня)
      for (let d = nextChargeDate(s.nextDate, s.period, s.anchorDay); d <= today && moreMissed < 99; d = nextChargeDate(d, s.period, s.anchorDay)) {
        moreMissed++
      }
    }
    items.push({
      subscription: s,
      date: s.nextDate,
      state: inDays < 0 ? 'overdue' : inDays === 0 ? 'today' : 'soon',
      inDays,
      moreMissed,
    })
  }
  return items.sort((a, b) => (a.date === b.date ? a.subscription.name.localeCompare(b.subscription.name) : a.date < b.date ? -1 : 1))
}

/** «сегодня», «завтра», «через 3 дня», «вчера», «5 дней назад» */
export function relativeDay(inDays: number): string {
  if (inDays === 0) return 'сегодня'
  if (inDays === 1) return 'завтра'
  if (inDays === 2) return 'послезавтра'
  if (inDays === -1) return 'вчера'
  const n = Math.abs(inDays)
  const n10 = n % 10
  const n100 = n % 100
  const word = n10 === 1 && n100 !== 11 ? 'день' : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? 'дня' : 'дней'
  return inDays > 0 ? `через ${n} ${word}` : `${n} ${word} назад`
}

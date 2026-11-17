import { describe, expect, it } from 'vitest'
import type { Subscription } from '../db/types'
import { daysBetween, dueItems, monthlyEquivalent, monthlyTotal, nextChargeDate, relativeDay } from './subscriptions'

const sub = (p: Partial<Subscription>): Subscription => ({
  id: p.name ?? 's',
  name: 'Подписка',
  amount: 79900,
  period: 'month',
  nextDate: '2026-11-20',
  anchorDay: 20,
  accountId: 'a',
  categoryId: 'c',
  paused: false,
  createdAt: 0,
  ...p,
})

describe('следующая дата списания', () => {
  it('неделя, месяц, квартал, год', () => {
    expect(nextChargeDate('2026-11-28', 'week', 28)).toBe('2026-12-05')
    expect(nextChargeDate('2026-11-15', 'month', 15)).toBe('2026-12-15')
    expect(nextChargeDate('2026-11-15', 'quarter', 15)).toBe('2027-02-15')
    expect(nextChargeDate('2026-11-15', 'year', 15)).toBe('2027-11-15')
  })

  it('через новый год', () => {
    expect(nextChargeDate('2026-12-10', 'month', 10)).toBe('2027-01-10')
  })

  it('подписка на 31-е: в коротких месяцах — последний день, потом снова 31-е', () => {
    let d = '2027-01-31'
    const seq: string[] = []
    for (let i = 0; i < 4; i++) {
      d = nextChargeDate(d, 'month', 31)
      seq.push(d)
    }
    expect(seq).toEqual(['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
  })

  it('високосный год', () => {
    expect(nextChargeDate('2028-01-30', 'month', 30)).toBe('2028-02-29')
    expect(nextChargeDate('2028-02-29', 'year', 29)).toBe('2029-02-28')
  })
})

describe('сумма в пересчёте на месяц', () => {
  it('по периодам', () => {
    expect(monthlyEquivalent(120000, 'year')).toBe(10000)
    expect(monthlyEquivalent(30000, 'quarter')).toBe(10000)
    expect(monthlyEquivalent(79900, 'month')).toBe(79900)
    expect(monthlyEquivalent(30000, 'week')).toBe(130000) // 300 ₽ × 52 / 12
  })

  it('подписки на паузе не считаются', () => {
    expect(monthlyTotal([sub({ amount: 50000 }), sub({ amount: 30000, paused: true }), sub({ amount: 120000, period: 'year' })])).toBe(60000)
  })
})

describe('плашка «Скоро спишется»', () => {
  const today = '2026-11-17'

  it('показывает списания в ближайшие N дней, сегодня и пропущенные', () => {
    const subs = [
      sub({ name: 'Через 3', nextDate: '2026-11-20' }),
      sub({ name: 'Через 4', nextDate: '2026-11-21' }),
      sub({ name: 'Сегодня', nextDate: '2026-11-17' }),
      sub({ name: 'Вчера', nextDate: '2026-11-16' }),
      sub({ name: 'Пауза', nextDate: '2026-11-17', paused: true }),
    ]
    const items = dueItems(subs, today, 3)
    expect(items.map((i) => [i.subscription.name, i.state, i.inDays])).toEqual([
      ['Вчера', 'overdue', -1],
      ['Сегодня', 'today', 0],
      ['Через 3', 'soon', 3],
    ])
    expect(dueItems(subs, today, 1).map((i) => i.subscription.name)).toEqual(['Вчера', 'Сегодня'])
  })

  it('долго не открывали: считает, сколько ещё списаний пропущено', () => {
    const [item] = dueItems([sub({ nextDate: '2026-08-20', anchorDay: 20 })], today, 3)
    // 20.08 — показываем; ещё 20.09 и 20.10 тоже прошли
    expect(item).toMatchObject({ date: '2026-08-20', state: 'overdue', moreMissed: 2 })
  })
})

describe('подписи', () => {
  it('дни', () => {
    expect(daysBetween('2026-11-17', '2026-11-20')).toBe(3)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2) // переход на летнее время не ломает счёт
    expect([0, 1, 2, 3, 5, 21, -1, -2, -11].map(relativeDay)).toEqual([
      'сегодня', 'завтра', 'послезавтра', 'через 3 дня', 'через 5 дней', 'через 21 день', 'вчера', '2 дня назад', '11 дней назад',
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { addDays, dayTitle, isoToRu, monthTitle, shiftMonth, shortDayLabel, toISODate } from './dates'

describe('даты', () => {
  it('ГГГГ-ММ-ДД по местному времени', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(isoToRu('2026-01-05')).toBe('05.01.2026')
  })

  it('сдвиг дней через границу месяца и года', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('заголовки дней', () => {
    const today = '2026-11-17'
    expect(dayTitle('2026-11-17', today)).toBe('Сегодня')
    expect(dayTitle('2026-11-16', today)).toBe('Вчера')
    expect(dayTitle('2026-11-15', today)).toBe('15 ноября, воскресенье')
    expect(dayTitle('2025-12-31', today)).toBe('31 декабря 2025, среда')
    expect(shortDayLabel('2026-11-15', today)).toBe('15 ноября')
  })

  it('месяцы', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(monthTitle('2026-11')).toBe('Ноябрь 2026')
  })
})

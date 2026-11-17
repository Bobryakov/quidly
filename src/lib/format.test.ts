import { describe, expect, it } from 'vitest'
import { formatDate, formatMoney, opsWord, weekdayMondayFirst } from './format'

const NBSP = ' '

describe('formatMoney', () => {
  it('пишет копейки через запятую и разряды через неразрывный пробел', () => {
    expect(formatMoney(123456)).toBe(`1${NBSP}234,56${NBSP}₽`)
    expect(formatMoney(123456789)).toBe(`1${NBSP}234${NBSP}567,89${NBSP}₽`)
  })

  it('добавляет ведущий ноль в копейках', () => {
    expect(formatMoney(105)).toBe(`1,05${NBSP}₽`)
    expect(formatMoney(5)).toBe(`0,05${NBSP}₽`)
  })

  it('ноль и отрицательные суммы', () => {
    expect(formatMoney(0)).toBe(`0,00${NBSP}₽`)
    expect(formatMoney(-150000)).toBe(`−1${NBSP}500,00${NBSP}₽`)
  })

  it('может скрывать нулевые копейки', () => {
    expect(formatMoney(100000, { hideZeroKopecks: true })).toBe(`1${NBSP}000${NBSP}₽`)
    expect(formatMoney(100050, { hideZeroKopecks: true })).toBe(`1${NBSP}000,50${NBSP}₽`)
  })

  it('не принимает дробные значения — суммы только в копейках', () => {
    expect(() => formatMoney(12.5)).toThrow()
  })
})

describe('formatDate', () => {
  it('ДД.ММ.ГГГГ с ведущими нулями', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('05.01.2026')
    expect(formatDate(new Date(2026, 10, 17))).toBe('17.11.2026')
  })
})

describe('weekdayMondayFirst', () => {
  it('неделя начинается с понедельника', () => {
    expect(weekdayMondayFirst(new Date(2026, 10, 16))).toBe(0) // понедельник
    expect(weekdayMondayFirst(new Date(2026, 10, 22))).toBe(6) // воскресенье
  })
})

describe('склонение', () => {
  it('1 операция, 2 операции, 5 операций, 11 операций, 21 операция', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(opsWord)).toEqual([
      '1 операция', '2 операции', '5 операций', '11 операций', '12 операций',
      '21 операция', '22 операции', '25 операций', '111 операций',
    ])
  })
})

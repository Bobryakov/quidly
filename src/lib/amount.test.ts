import { describe, expect, it } from 'vitest'
import { displayKeypad, keypadToKopecks, kopecksToKeypad, parseAmount, pressKey, type KeypadKey } from './amount'

const type = (keys: KeypadKey[], start = '') => keys.reduce(pressKey, start)

describe('клавиатура суммы', () => {
  it('набирает рубли и копейки', () => {
    expect(type(['3', '5', '0'])).toBe('350')
    expect(type(['1', '2', ',', '5'])).toBe('12,5')
    expect(keypadToKopecks('12,5')).toBe(1250)
    expect(keypadToKopecks('12,05')).toBe(1205)
    expect(keypadToKopecks('350')).toBe(35000)
  })

  it('не даёт ввести больше двух цифр копеек и вторую запятую', () => {
    expect(type(['1', ',', '2', '3', '4'])).toBe('1,23')
    expect(type(['1', ',', ',', '5'])).toBe('1,5')
  })

  it('запятая первой превращается в «0,»', () => {
    expect(type([',', '5'])).toBe('0,5')
    expect(keypadToKopecks('0,5')).toBe(50)
  })

  it('без ведущих нулей', () => {
    expect(type(['0', '0', '7'])).toBe('7')
  })

  it('стирание', () => {
    expect(type(['1', '2', 'back'])).toBe('1')
    expect(type(['back'])).toBe('')
    expect(keypadToKopecks('')).toBe(0)
  })

  it('ограничивает длину суммы', () => {
    const many = Array(15).fill('9') as KeypadKey[]
    expect(type(many)).toBe('999999999')
  })

  it('показывает разряды при вводе', () => {
    expect(displayKeypad('1234567,5')).toBe('1 234 567,5')
    expect(displayKeypad('')).toBe('0')
  })

  it('сохранённую сумму можно вернуть в клавиатуру для правки', () => {
    expect(kopecksToKeypad(35000)).toBe('350')
    expect(kopecksToKeypad(1250)).toBe('12,5')
    expect(kopecksToKeypad(1205)).toBe('12,05')
    for (const k of [1, 99, 100, 123456, 1205]) expect(keypadToKopecks(kopecksToKeypad(k))).toBe(k)
  })
})

describe('parseAmount — сумма из текстового поля', () => {
  it('разные формы записи', () => {
    expect(parseAmount('12 345,67')).toBe(1234567)
    expect(parseAmount('12345.6')).toBe(1234560)
    expect(parseAmount('1 000 ₽')).toBe(100000)
    expect(parseAmount('-500')).toBe(-50000)
    expect(parseAmount('−500')).toBe(-50000)
    expect(parseAmount('')).toBe(0)
  })

  it('не число → null', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1,234')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })
})

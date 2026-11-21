import { describe, expect, it } from 'vitest'
import { attemptsLeft, hashPin, isValidPin, pauseAfter, registerFail, shouldLock, verifyPin } from './pin'

const FAST = 1000 // в тестах — меньше повторений, чтобы не ждать

describe('PIN', () => {
  it('принимает только 4–6 цифр', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('123456')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('1234567')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
    expect(isValidPin('')).toBe(false)
  })

  it('хранится только хеш с солью; верный PIN подходит, неверный — нет', async () => {
    const r = await hashPin('2580', FAST)
    expect(JSON.stringify(r)).not.toContain('2580')
    expect(r.length).toBe(4)
    expect(r.iterations).toBe(FAST)
    expect(await verifyPin('2580', r)).toBe(true)
    expect(await verifyPin('2581', r)).toBe(false)
    expect(await verifyPin('25800', r)).toBe(false)
  })

  it('один и тот же PIN даёт разные хеши (соль случайная)', async () => {
    const a = await hashPin('111111', FAST)
    const b = await hashPin('111111', FAST)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it('по умолчанию — 300 000 повторений', async () => {
    expect((await hashPin('9999')).iterations).toBe(300_000)
  })

  it('неверный PIN не сохраняется', async () => {
    await expect(hashPin('12')).rejects.toThrow()
  })
})

describe('пауза после ошибок', () => {
  it('5 ошибок — 30 секунд, 10 — 5 минут, 15 — 15 минут', () => {
    expect(pauseAfter(4)).toBe(0)
    expect(pauseAfter(5)).toBe(30_000)
    expect(pauseAfter(6)).toBe(0)
    expect(pauseAfter(10)).toBe(300_000)
    expect(pauseAfter(15)).toBe(900_000)
    expect(pauseAfter(20)).toBe(900_000)
  })

  it('считает ошибки и ставит паузу на пятой', () => {
    let f = undefined as ReturnType<typeof registerFail> | undefined
    for (let i = 0; i < 4; i++) f = registerFail(f, 1000)
    expect(f).toEqual({ count: 4 })
    expect(attemptsLeft(f)).toBe(1)
    f = registerFail(f, 1000)
    expect(f).toEqual({ count: 5, until: 31_000 })
    expect(attemptsLeft(f)).toBe(5)
    expect(attemptsLeft(undefined)).toBe(5)
  })
})

describe('автоблокировка', () => {
  it('блокирует, если в фоне пробыли не меньше заданного времени', () => {
    expect(shouldLock(undefined, 10_000, 60)).toBe(false)
    expect(shouldLock(0, 59_999, 60)).toBe(false)
    expect(shouldLock(0, 60_000, 60)).toBe(true)
    expect(shouldLock(0, 1, 0)).toBe(true)
    expect(shouldLock(0, 299_000, 300)).toBe(false)
  })
})

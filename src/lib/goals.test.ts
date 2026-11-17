import { describe, expect, it } from 'vitest'
import type { Goal, GoalMove } from '../db/types'
import { goalBalances, goalPercent, goalPlan, justAchieved, monthsLeft, totalSaved } from './goals'

const goal = (p: Partial<Goal> = {}): Goal => ({
  id: 'g', name: 'Отпуск', emoji: '🏖️', color: '#000', target: 10000000, createdAt: 0, ...p,
})
let n = 0
const move = (goalId: string, amount: number): GoalMove => ({
  id: String(++n), goalId, amount, date: '2026-11-17', source: 'manual', createdAt: n,
})

describe('баланс копилок', () => {
  it('пополнения минус снятия', () => {
    const b = goalBalances([move('a', 500000), move('a', -100000), move('b', 30000)])
    expect(b.get('a')).toBe(400000)
    expect(b.get('b')).toBe(30000)
    expect(totalSaved([goal({ id: 'a' }), goal({ id: 'b' })], b)).toBe(430000)
  })

  it('прогресс в процентах, не больше 100', () => {
    expect(goalPercent(2500000, 10000000)).toBe(25)
    expect(goalPercent(12000000, 10000000)).toBe(100)
    expect(goalPercent(0, 0)).toBe(0)
  })
})

describe('«откладывай X ₽ в месяц»', () => {
  const today = '2026-11-17'

  it('месяцы считаются вместе с текущим и месяцем срока', () => {
    expect(monthsLeft(today, '2026-11-30')).toBe(1)
    expect(monthsLeft(today, '2026-12-31')).toBe(2)
    expect(monthsLeft(today, '2027-06-01')).toBe(8)
  })

  it('делит остаток на месяцы и округляет вверх до рубля', () => {
    // нужно 100 000, есть 20 000 → 80 000 за 3 месяца (ноябрь, декабрь, январь) = 26 666,67 → 26 667
    const plan = goalPlan(goal({ deadline: '2027-01-15' }), 2000000, today)
    expect(plan).toMatchObject({ kind: 'monthly', remaining: 8000000, months: 3, perMonth: 2666700 })
  })

  it('без срока — просто копим; срок прошёл; цель достигнута', () => {
    expect(goalPlan(goal(), 0, today)).toEqual({ kind: 'no-deadline', remaining: 10000000 })
    expect(goalPlan(goal({ deadline: '2026-10-01' }), 0, today).kind).toBe('overdue')
    expect(goalPlan(goal({ deadline: '2026-12-01' }), 10000000, today).kind).toBe('done')
  })
})

describe('достижение цели', () => {
  it('только в момент перехода через целевую сумму', () => {
    expect(justAchieved(9000, 10000, 10000)).toBe(true)
    expect(justAchieved(10000, 12000, 10000)).toBe(false)
    expect(justAchieved(5000, 9999, 10000)).toBe(false)
  })
})

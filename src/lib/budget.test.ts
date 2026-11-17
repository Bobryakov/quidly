import { describe, expect, it } from 'vitest'
import type { BudgetRecord, MonthClosing, Transaction } from '../db/types'
import {
  budgetFor,
  budgetStartMonth,
  budgetWarning,
  carryInFor,
  closeMonth,
  computeMonthBudget,
  defaultActions,
  levelOf,
  limitFor,
  monthsToAutoClose,
  pendingSummaryMonth,
  type BudgetContext,
} from './budget'

const RUB = 100 // копеек в рубле
let seq = 0
const rec = (categoryId: string, limitRub: number | null, fromMonth: string): BudgetRecord => ({
  id: `b${++seq}`, categoryId, limit: limitRub === null ? null : limitRub * RUB, fromMonth,
})
const spend = (categoryId: string, rub: number, date: string): Transaction => ({
  id: `t${++seq}`, type: 'expense', amount: rub * RUB, date, accountId: 'a', categoryId, createdAt: seq, updatedAt: seq,
})

function ctx(p: Partial<BudgetContext> = {}): BudgetContext {
  return {
    records: [],
    transactions: [],
    categoryIds: ['food', 'cafe', 'bus', 'gifts'],
    closings: new Map(),
    rolloverOff: new Set(),
    carryOverspend: false,
    ...p,
  }
}

describe('цвет прогресса', () => {
  it('зелёный < 80%, жёлтый 80–100%, красный > 100%', () => {
    expect(levelOf(79, 100).level).toBe('ok')
    expect(levelOf(80, 100).level).toBe('warn')
    expect(levelOf(100, 100).level).toBe('warn')
    expect(levelOf(101, 100).level).toBe('over')
  })
  it('нулевой лимит: ничего не потрачено — норма, потрачено — красный', () => {
    expect(levelOf(0, 0).level).toBe('ok')
    expect(levelOf(1, 0).level).toBe('over')
    expect(levelOf(0, -500).level).toBe('over')
  })
})

describe('лимиты по месяцам', () => {
  const records = [rec('cafe', 5000, '2026-09'), rec('cafe', 4000, '2026-11'), rec('cafe', null, '2027-01')]
  it('действует последний лимит, заданный не позже месяца', () => {
    expect(limitFor(records, 'cafe', '2026-08')).toBeNull()
    expect(limitFor(records, 'cafe', '2026-10')).toBe(500000)
    expect(limitFor(records, 'cafe', '2026-12')).toBe(400000)
    expect(limitFor(records, 'cafe', '2027-02')).toBeNull()
  })
  it('начало бюджетов', () => {
    expect(budgetStartMonth(records)).toBe('2026-09')
    expect(budgetStartMonth([])).toBeNull()
  })
})

describe('бюджет месяца', () => {
  it('считает потраченное и остаток; переводы и доходы не входят', () => {
    const c = ctx({
      records: [rec('food', 10000, '2026-11'), rec('cafe', 3000, '2026-11')],
      transactions: [
        spend('food', 2500, '2026-11-03'),
        spend('food', 500, '2026-10-31'), // другой месяц
        spend('cafe', 2700, '2026-11-10'),
        spend('bus', 300, '2026-11-10'), // без лимита — только в общий
        { ...spend('food', 999, '2026-11-05'), type: 'income' },
        { ...spend('food', 999, '2026-11-05'), type: 'transfer', categoryId: undefined },
      ],
    })
    const mb = computeMonthBudget(c, '2026-11', {})
    const [food, cafe] = mb.categories
    expect(food).toMatchObject({ categoryId: 'food', spent: 250000, left: 750000, level: 'ok' })
    expect(cafe).toMatchObject({ spent: 270000, left: 30000, level: 'warn' })
    expect(mb.total).toMatchObject({ limit: 1300000, custom: false, spent: 550000, left: 750000 })
  })

  it('свой общий лимит заменяет сумму категорий', () => {
    const c = ctx({ records: [rec('food', 10000, '2026-11'), rec('total', 50000, '2026-11')] })
    expect(computeMonthBudget(c, '2026-11', {}).total).toMatchObject({ limit: 5000000, custom: true })
  })

  it('перенос добавляется к лимиту: «10 000 ₽ + 1 200 ₽ с прошлого месяца»', () => {
    const c = ctx({ records: [rec('food', 10000, '2026-11')] })
    const [food] = computeMonthBudget(c, '2026-11', { food: 1200 * RUB }).categories
    expect(food).toMatchObject({ limit: 1000000, carryIn: 120000, available: 1120000 })
  })

  it('без бюджетов месяц неактивен', () => {
    expect(computeMonthBudget(ctx(), '2026-11', {}).active).toBe(false)
  })
})

describe('закрытие месяца', () => {
  // Октябрь: еда — остаток 1 200, кафе — остаток 500, транспорт — перерасход 800, подарки — остаток 2 000
  const c = ctx({
    records: [rec('food', 10000, '2026-10'), rec('cafe', 3000, '2026-10'), rec('bus', 2000, '2026-10'), rec('gifts', 2000, '2026-10')],
    transactions: [spend('food', 8800, '2026-10-05'), spend('cafe', 2500, '2026-10-06'), spend('bus', 2800, '2026-10-07')],
  })
  const oct = computeMonthBudget(c, '2026-10', {})
  const opts = { carryOverspend: false, rolloverOff: new Set<string>() }

  it('по умолчанию остатки переносятся, перерасход — нет', () => {
    const r = closeMonth(oct, defaultActions(oct, new Set()), opts)
    expect(r.carries).toEqual({ food: 120000, cafe: 50000, gifts: 200000 })
    expect(r.toGoals).toEqual({})
  })

  it('«Обнулить» — остаток не переносится', () => {
    const r = closeMonth(oct, { food: { type: 'reset' }, cafe: { type: 'carry' }, gifts: { type: 'carry' } }, opts)
    expect(r.carries).toEqual({ cafe: 50000, gifts: 200000 })
  })

  it('«Покрыть перерасход»: сэкономили на кафе — покрыли транспорт', () => {
    const r = closeMonth(oct, { cafe: { type: 'cover', to: 'bus' } }, opts)
    // кафе: 500 ушло на транспорт целиком; транспорт: −800 + 500 = −300 (не переносится)
    expect(r.covered).toEqual({ bus: 50000 })
    expect(r.carries.cafe).toBeUndefined()
    expect(r.carries.bus).toBeUndefined()
    expect(r.carries.food).toBe(120000)
  })

  it('покрытие берёт не больше, чем нужно; остаток переносится', () => {
    const r = closeMonth(oct, { gifts: { type: 'cover', to: 'bus' } }, opts)
    expect(r.covered).toEqual({ bus: 80000 })
    expect(r.carries.gifts).toBe(120000) // 2 000 − 800
  })

  it('два покрытия одной дыры: первой гасит категория выше в списке, второй ничего не нужно', () => {
    const r = closeMonth(oct, { cafe: { type: 'cover', to: 'bus' }, food: { type: 'cover', to: 'bus' } }, opts)
    expect(r.covered.bus).toBe(80000)
    expect(r.carries.food).toBe(120000 - 80000) // еда стоит раньше кафе и закрыла все 800
    expect(r.carries.cafe).toBe(50000) // кафе не понадобилось — остаток переносится
  })

  it('с настройкой «Переносить перерасход» минус уходит в следующий месяц', () => {
    const r = closeMonth(oct, { cafe: { type: 'cover', to: 'bus' } }, { ...opts, carryOverspend: true })
    expect(r.carries.bus).toBe(-30000)
  })

  it('перенос выключен для категории — остаток обнуляется', () => {
    const off = new Set(['food'])
    const r = closeMonth(oct, defaultActions(oct, off), { ...opts, rolloverOff: off })
    expect(r.carries.food).toBeUndefined()
    expect(r.carries.gifts).toBe(200000)
  })

  it('«В копилку»: остаток уходит в копилку и не переносится в лимит', () => {
    const r = closeMonth(oct, { food: { type: 'goal', goalId: 'trip' }, gifts: { type: 'carry' } }, opts)
    expect(r.toGoals).toEqual({ food: { goalId: 'trip', amount: 120000 } })
    expect(r.carries.food).toBeUndefined()
    expect(r.carries.gifts).toBe(200000)
  })

  it('сначала покрытие, остаток — в копилку', () => {
    const r = closeMonth(oct, { gifts: { type: 'cover', to: 'bus' }, cafe: { type: 'goal', goalId: 'trip' } }, opts)
    expect(r.covered.bus).toBe(80000)
    expect(r.toGoals).toEqual({ cafe: { goalId: 'trip', amount: 50000 } })
  })

  it('покрыть категорию без перерасхода нельзя — ничего не меняется', () => {
    const r = closeMonth(oct, { cafe: { type: 'cover', to: 'food' } }, opts)
    expect(r.covered).toEqual({})
    expect(r.carries.cafe).toBe(50000)
  })
})

describe('перенос между месяцами', () => {
  const base = ctx({
    records: [rec('food', 10000, '2026-10')],
    transactions: [spend('food', 9000, '2026-10-10'), spend('food', 10500, '2026-11-10')],
  })

  it('пока прошлый месяц не закрыт — предварительный перенос по умолчанию', () => {
    expect(carryInFor(base, '2026-11')).toEqual({ food: 100000 })
    // ноябрь: 10 000 + 1 000 − 10 500 = 500; декабрь получит 500 (цепочка через незакрытые месяцы)
    expect(carryInFor(base, '2026-12')).toEqual({ food: 50000 })
  })

  it('закрытый месяц: берётся то, что решил человек', () => {
    const closing: MonthClosing = {
      month: '2026-10', closedAt: 1, auto: false, actions: { food: { type: 'reset' } }, carries: {}, covered: {},
    }
    const c = { ...base, closings: new Map([['2026-10', closing]]) }
    expect(carryInFor(c, '2026-11')).toEqual({})
    expect(budgetFor(c, '2026-11').categories[0]).toMatchObject({ available: 1000000, left: -50000, level: 'over' })
  })

  it('до первого бюджета переносов нет', () => {
    expect(carryInFor(base, '2026-10')).toEqual({})
  })
})

describe('когда закрывать месяцы', () => {
  const c = ctx({ records: [rec('food', 10000, '2026-09')] })

  it('прошлый месяц ждёт решения до 7-го числа', () => {
    expect(monthsToAutoClose(c, '2026-11-07')).toEqual(['2026-09'])
    expect(monthsToAutoClose(c, '2026-11-08')).toEqual(['2026-09', '2026-10'])
  })

  it('закрытые месяцы пропускаются', () => {
    const closed: MonthClosing = { month: '2026-09', closedAt: 1, auto: true, actions: {}, carries: {}, covered: {} }
    expect(monthsToAutoClose({ ...c, closings: new Map([['2026-09', closed]]) }, '2026-11-01')).toEqual([])
  })

  it('карточка «Итоги месяца» — для незакрытого прошлого месяца с бюджетами', () => {
    expect(pendingSummaryMonth(c, '2026-11-03')).toBe('2026-10')
    expect(pendingSummaryMonth(c, '2026-09-15')).toBeNull() // прошлого месяца с бюджетом ещё не было
    expect(pendingSummaryMonth(ctx(), '2026-11-03')).toBeNull()
  })
})

describe('предупреждения после траты', () => {
  const cb = (level: 'ok' | 'warn' | 'over') => ({
    categoryId: 'cafe', limit: 1, carryIn: 0, available: 1, spent: 1, left: 0, percent: 0, level,
  })
  it('предупреждает при переходе через 80% и через 100%', () => {
    expect(budgetWarning(cb('ok'), cb('warn'))?.level).toBe('warn')
    expect(budgetWarning(cb('warn'), cb('over'))?.level).toBe('over')
    expect(budgetWarning(cb('ok'), cb('over'))?.level).toBe('over')
  })
  it('не повторяет одно и то же предупреждение', () => {
    expect(budgetWarning(cb('warn'), cb('warn'))).toBeNull()
    expect(budgetWarning(cb('over'), cb('over'))).toBeNull()
    expect(budgetWarning(cb('ok'), cb('ok'))).toBeNull()
    expect(budgetWarning(undefined, undefined)).toBeNull()
  })
})

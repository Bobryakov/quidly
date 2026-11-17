import { describe, expect, it } from 'vitest'
import { defaultCategories } from '../db/seed'
import type { Account, ImportRule, Subscription, Transaction } from '../db/types'
import { applyCategoryChoice, balanceAfterImport, buildPlan, importKey, planSummary, toggleTransfer, type PlanInput } from './plan'
import type { ParsedRow } from './types'

const categories = defaultCategories(0)
const cat = (name: string) => categories.find((c) => c.name === name)!.id
const acc = (id: string, name: string, type: Account['type'] = 'card'): Account => ({
  id, name, type, emoji: '', color: '', initialBalance: 0, archived: false, order: 0, createdAt: 0,
})
const accounts = [acc('sber', 'Сбер'), acc('cash', 'Наличные', 'cash'), acc('tb', 'Т-Банк')]
const row = (p: Partial<ParsedRow>): ParsedRow => ({
  date: '2026-11-10', time: '12:00', amount: 10000, direction: 'out', description: 'MAGAZIN 1 MOSCOW RUS', bankCategory: 'Супермаркеты', ...p,
})

function plan(rows: ParsedRow[], extra: Partial<PlanInput> = {}) {
  return buildPlan({
    statement: { bank: 'sber', bankName: 'Сбер', rows },
    accountId: 'sber',
    accounts,
    categories,
    rules: [],
    transactions: [],
    subscriptions: [],
    ...extra,
  })
}

describe('категории при импорте', () => {
  it('категория банка → наша категория; непонятное — «Прочее» / «Прочие доходы»', () => {
    const items = plan([
      row({ bankCategory: 'Супермаркеты' }),
      row({ bankCategory: 'Рестораны и кафе', time: '13:00' }),
      row({ bankCategory: 'Оплата по QR–коду СБП', time: '14:00' }),
      row({ bankCategory: 'Перевод на карту', direction: 'in', description: 'Перевод от Т. Тест' }),
    ])
    expect(items.map((i) => [i.kind, i.categoryId, i.categorySource])).toEqual([
      ['expense', cat('Продукты'), 'bank'],
      ['expense', cat('Кафе'), 'bank'],
      ['expense', cat('Прочее'), 'default'],
      ['income', cat('Прочие доходы'), 'default'],
    ])
  })

  it('правило пользователя важнее категории банка; MCC — если категории банка нет', () => {
    const rules: ImportRule[] = [{ id: 'r', pattern: 'YANDEX EDA', categoryId: cat('Кафе'), createdAt: 0 }]
    const items = plan(
      [
        row({ description: 'YANDEX*5814*EDA MOSCOW RUS', bankCategory: 'Прочие расходы' }),
        row({ description: 'APTEKA 36.6', bankCategory: undefined, mcc: '5912', time: '15:00' }),
      ],
      { rules },
    )
    expect(items[0]).toMatchObject({ categoryId: cat('Кафе'), categorySource: 'rule' })
    expect(items[1]).toMatchObject({ categoryId: cat('Здоровье'), categorySource: 'mcc' })
  })

  it('исправление категории применяется ко всем покупкам у этого продавца', () => {
    const items = plan([
      row({ description: 'KOPIRKA 1 MOSCOW RUS', bankCategory: 'Прочие расходы' }),
      row({ description: 'KOPIRKA 2 MOSCOW RUS', bankCategory: 'Прочие расходы', time: '13:00' }),
      row({ description: 'OTHER', bankCategory: 'Прочие расходы', time: '14:00' }),
    ])
    const { items: next, pattern } = applyCategoryChoice(items, 0, cat('Образование'))
    expect(pattern).toBe('KOPIRKA')
    expect(next.map((i) => i.categoryId)).toEqual([cat('Образование'), cat('Образование'), cat('Прочее')])
  })
})

describe('переводы на свои счета', () => {
  it('«Перевод в T-Bank» → перевод на счёт «Т-Банк»', () => {
    const [it] = plan([row({ bankCategory: 'Перевод СБП', description: 'Перевод в T-Bank' })])
    expect(it).toMatchObject({ kind: 'transfer', counterAccountId: 'tb' })
  })

  it('SBOL — перевод внутри Сбера: на второй свой счёт в Сбере, если он заведён', () => {
    const withSaving = [...accounts, acc('sbsave', 'Сбер накопительный')]
    const [out, inc] = plan(
      [
        row({ bankCategory: 'Перевод с карты', description: 'SBOL' }),
        row({ bankCategory: 'Перевод на карту', direction: 'in', description: 'SBOL', time: '13:00' }),
      ],
      { accounts: withSaving },
    )
    expect(out).toMatchObject({ kind: 'transfer', counterAccountId: 'sbsave' })
    expect(inc).toMatchObject({ kind: 'transfer', counterAccountId: 'sbsave' })
    // без второго счёта в Сбере — обычный расход
    expect(plan([row({ bankCategory: 'Перевод с карты', description: 'SBOL' })])[0].kind).toBe('expense')
  })

  it('перевод человеку или в банк, которого нет среди счетов, — расход', () => {
    const items = plan([
      row({ bankCategory: 'Перевод СБП', description: 'Перевод для Т. Тест' }),
      row({ bankCategory: 'Перевод СБП', description: 'Перевод в ВТБ', time: '13:00' }),
    ])
    expect(items.map((i) => i.kind)).toEqual(['expense', 'expense'])
  })

  it('магазин с названием банка в описании — не перевод', () => {
    const [it] = plan([row({ description: 'OZON.RU MOSCOW', bankCategory: 'Прочие расходы' })], {
      accounts: [...accounts, acc('oz', 'Озон Банк')],
    })
    expect(it.kind).toBe('expense')
  })

  it('выдача наличных → перевод на «Наличные», комиссия — отдельной тратой', () => {
    const [it] = plan([row({ bankCategory: 'Выдача наличных', description: 'Банкомат', amount: 120000, fee: 20000 })])
    expect(it).toMatchObject({ kind: 'transfer', counterAccountId: 'cash', fee: 20000 })
  })

  it('внесение наличных → перевод с «Наличных»', () => {
    const [it] = plan([row({ bankCategory: 'Внесение наличных', direction: 'in', description: 'Банкомат' })])
    expect(it).toMatchObject({ kind: 'transfer', counterAccountId: 'cash' })
  })

  it('без счёта «Наличные» — обычный расход; можно переключить вручную', () => {
    const only = [acc('sber', 'Сбер'), acc('tb', 'Т-Банк')]
    const [it] = plan([row({ bankCategory: 'Выдача наличных', description: 'Банкомат' })], { accounts: only })
    expect(it.kind).toBe('expense')
    const t = toggleTransfer(it, 'sber', only, categories, [])
    expect(t).toMatchObject({ kind: 'transfer', counterAccountId: 'tb', categoryId: undefined })
    expect(toggleTransfer(t, 'sber', only, categories, []).kind).toBe('expense')
  })
})

describe('возвраты', () => {
  it('возврат гасит покупку у того же продавца на ту же сумму — обе не импортируются', () => {
    const items = plan([
      row({ bankCategory: 'Возврат, отмена операции', direction: 'in', description: 'YM*SHOP MOSCOW RUS', amount: 100, authCode: '1' }),
      row({ bankCategory: 'Прочие расходы', description: 'YM*SHOP MOSCOW RUS', amount: 100, authCode: '1' }),
      row({ bankCategory: 'Возврат, отмена операции', direction: 'in', description: 'YM*SHOP MOSCOW RUS', amount: 100, authCode: '2', time: '12:01' }),
      row({ bankCategory: 'Прочие расходы', description: 'YM*SHOP MOSCOW RUS', amount: 100, authCode: '2', time: '12:01' }),
    ])
    expect(items.map((i) => [i.status, i.include, i.pairedWith])).toEqual([
      ['refund-pair', false, 1],
      ['refund-pair', false, 0],
      ['refund-pair', false, 3],
      ['refund-pair', false, 2],
    ])
  })

  it('возврат без покупки в выписке — доход «Прочие доходы»', () => {
    const [it] = plan([row({ bankCategory: 'Возврат, отмена операции', direction: 'in', description: 'SHOP' })])
    expect(it).toMatchObject({ status: 'new', kind: 'income', categoryId: cat('Прочие доходы') })
  })
})

describe('дубли', () => {
  const tx = (p: Partial<Transaction>): Transaction => ({
    id: 'm1', type: 'expense', amount: 10000, date: '2026-11-10', accountId: 'sber', categoryId: cat('Продукты'), createdAt: 0, updatedAt: 0, ...p,
  })

  it('та же выписка второй раз — «уже импортировано»', () => {
    const r = row({})
    const key = importKey('sber', 'sber', r)
    const [it] = plan([r], { transactions: [tx({ id: 'old', importKey: key })] })
    expect(it).toMatchObject({ status: 'duplicate', include: false, matchedTransactionId: 'old' })
  })

  it('две одинаковые покупки в один день — обе новые, при повторе — обе дубли', () => {
    const items = plan([row({ authCode: undefined }), row({ authCode: undefined })])
    expect(items.map((i) => i.status)).toEqual(['new', 'new'])
    expect(items[0].key).not.toBe(items[1].key)
    const again = plan([row({ authCode: undefined }), row({ authCode: undefined })], {
      transactions: items.map((i, n) => tx({ id: `t${n}`, importKey: i.key })),
    })
    expect(again.map((i) => i.status)).toEqual(['duplicate', 'duplicate'])
  })

  it('похоже на трату, внесённую вручную (±1 день) — помечено и не импортируется', () => {
    const items = plan([row({ date: '2026-11-11' }), row({ date: '2026-11-11', time: '18:00' })], { transactions: [tx({})] })
    expect(items[0]).toMatchObject({ status: 'possible-duplicate', include: false, matchedTransactionId: 'm1' })
    expect(items[1].status).toBe('new') // одна ручная трата совпадает только с одной строкой
  })

  it('ручная трата с другого счёта или двумя днями раньше — не дубль', () => {
    const items = plan([row({})], { transactions: [tx({ accountId: 'tb' }), tx({ id: 'm2', date: '2026-11-08' })] })
    expect(items[0].status).toBe('new')
  })

  it('снятие наличных, внесённое вручную переводом, — похоже на дубль', () => {
    const [it] = plan([row({ bankCategory: 'Выдача наличных', description: 'Банкомат', amount: 120000, fee: 20000 })], {
      transactions: [tx({ type: 'transfer', amount: 100000, accountId: 'sber', toAccountId: 'cash', categoryId: undefined })],
    })
    expect(it.status).toBe('possible-duplicate')
  })
})

describe('подписки', () => {
  it('списание подписки находится по сумме и дате (±3 дня)', () => {
    const sub: Subscription = {
      id: 'kino', name: 'Кино', amount: 29900, period: 'month', nextDate: '2026-11-12', anchorDay: 12,
      accountId: 'sber', categoryId: cat('Подписки'), paused: false, createdAt: 0,
    }
    const items = plan(
      [row({ amount: 29900, description: 'KINO SERVICE', bankCategory: 'Прочие расходы' }), row({ amount: 29900, date: '2026-11-20', time: '10:00' })],
      { subscriptions: [sub] },
    )
    expect(items[0]).toMatchObject({ subscriptionId: 'kino', categoryId: cat('Подписки') })
    expect(items[1].subscriptionId).toBeUndefined()
  })
})

describe('сводка', () => {
  it('считает выбранные, дубли и переводы', () => {
    const items = plan([
      row({}),
      row({ bankCategory: 'Перевод СБП', description: 'Перевод в T-Bank', time: '13:00' }),
      row({ bankCategory: 'Возврат', direction: 'in', time: '14:00' }),
      row({ time: '14:00' }),
    ])
    expect(planSummary(items)).toEqual({ total: 4, selected: 2, duplicates: 0, possible: 0, refunds: 2, transfers: 1 })
  })
})

describe('баланс после импорта', () => {
  it('начальный остаток + записанное + отмеченное в предпросмотре, по дату включительно', () => {
    const a = { ...accounts[0], initialBalance: 100000 }
    const items = plan([row({ amount: 20000 }), row({ direction: 'in', amount: 5000, bankCategory: 'Зарплата', time: '13:00' }), row({ date: '2026-12-01', time: '14:00' })])
    items[0].include = true
    const existing: Transaction[] = [{ id: 'x', type: 'expense', amount: 1000, date: '2026-11-01', accountId: 'sber', categoryId: 'c', createdAt: 0, updatedAt: 0 }]
    expect(balanceAfterImport(a, existing, items, '2026-11-30')).toBe(100000 - 1000 - 20000 + 5000)
  })
})

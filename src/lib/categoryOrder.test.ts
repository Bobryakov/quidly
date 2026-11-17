import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '../db/types'
import { orderCategoriesByUsage } from './categoryOrder'

const cat = (id: string, order: number): Category => ({
  id, name: id, kind: 'expense', emoji: '', color: '', order, createdAt: 0,
})
const use = (categoryId: string, date: string, createdAt: number): Transaction => ({
  id: `${categoryId}-${createdAt}`, type: 'expense', amount: 100, date, accountId: 'a', categoryId, createdAt, updatedAt: createdAt,
})

describe('порядок категорий в быстром вводе', () => {
  const cats = [cat('food', 0), cat('cafe', 1), cat('bus', 2), cat('home', 3)]
  const today = '2026-11-17'

  it('без операций — исходный порядок', () => {
    expect(orderCategoriesByUsage(cats, [], today).map((c) => c.id)).toEqual(['food', 'cafe', 'bus', 'home'])
  })

  it('частые — первыми', () => {
    const txs = [use('bus', today, 1), use('bus', today, 2), use('cafe', today, 3)]
    expect(orderCategoriesByUsage(cats, txs, today).map((c) => c.id)).toEqual(['bus', 'cafe', 'food', 'home'])
  })

  it('при равной частоте — та, что использовалась позже', () => {
    const txs = [use('home', today, 5), use('cafe', today, 9)]
    expect(orderCategoriesByUsage(cats, txs, today).map((c) => c.id).slice(0, 2)).toEqual(['cafe', 'home'])
  })

  it('операции старше 60 дней не делают категорию «частой», но учитываются как недавние', () => {
    const txs = [use('home', '2026-01-01', 1), use('home', '2026-01-02', 2), use('cafe', today, 3)]
    expect(orderCategoriesByUsage(cats, txs, today).map((c) => c.id).slice(0, 2)).toEqual(['cafe', 'home'])
  })
})

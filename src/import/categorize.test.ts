import { describe, expect, it } from 'vitest'
import { defaultCategories } from '../db/seed'
import { categorize } from './categorize'
import type { ParsedRow } from './types'

const row = (p: Partial<ParsedRow>): ParsedRow => ({ date: '2026-11-10', amount: 100, direction: 'out', description: 'X', ...p })
const all = defaultCategories(1)
const name = (id: string, cats = all) => cats.find((c) => c.id === id)?.name

describe('автокатегории', () => {
  it('коммунальные платежи — в «ЖКХ» (по MCC 4900 и по категории банка)', () => {
    expect(name(categorize(row({ mcc: '4900' }), 'expense', all, []).categoryId)).toBe('ЖКХ')
    expect(name(categorize(row({ bankCategory: 'Коммунальные платежи' }), 'expense', all, []).categoryId)).toBe('ЖКХ')
  })

  it('если «ЖКХ» удалили — коммуналка идёт в «Дом», как раньше', () => {
    const noUtil = all.filter((c) => c.name !== 'ЖКХ')
    expect(name(categorize(row({ mcc: '4900' }), 'expense', noUtil, []).categoryId, noUtil)).toBe('Дом')
    expect(name(categorize(row({ bankCategory: 'ЖКХ' }), 'expense', noUtil, []).categoryId, noUtil)).toBe('Дом')
  })

  it('стройматериалы по MCC — по-прежнему «Дом»', () => {
    expect(name(categorize(row({ mcc: '5211' }), 'expense', all, []).categoryId)).toBe('Дом')
  })
})

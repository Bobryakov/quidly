import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../db/types'
import { computeBalances, initialBalanceForTarget, sumByType, totalBalance } from './balance'

const acc = (id: string, initialBalance: number, archived = false): Account => ({
  id, name: id, type: 'card', emoji: '💳', color: '#000', initialBalance, archived, order: 0, createdAt: 0,
})
let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'accountId'>): Transaction => ({
  id: String(++n), date: '2026-11-17', createdAt: n, updatedAt: n, ...p,
})

describe('балансы счетов', () => {
  const accounts = [acc('card', 100000), acc('cash', 5000), acc('old', 30000, true)]

  it('начальный остаток + доходы − расходы', () => {
    const b = computeBalances(accounts, [
      tx({ type: 'expense', amount: 35000, accountId: 'card', categoryId: 'food' }),
      tx({ type: 'income', amount: 200000, accountId: 'card', categoryId: 'salary' }),
      tx({ type: 'expense', amount: 1000, accountId: 'cash', categoryId: 'food' }),
    ])
    expect(b.get('card')).toBe(100000 - 35000 + 200000)
    expect(b.get('cash')).toBe(4000)
  })

  it('перевод уменьшает один счёт и увеличивает другой, общий баланс не меняется', () => {
    const txs = [tx({ type: 'transfer', amount: 20000, accountId: 'card', toAccountId: 'cash' })]
    const b = computeBalances(accounts, txs)
    expect(b.get('card')).toBe(80000)
    expect(b.get('cash')).toBe(25000)
    expect(totalBalance(accounts, b)).toBe(105000)
  })

  it('перевод не считается ни расходом, ни доходом', () => {
    const txs = [
      tx({ type: 'transfer', amount: 20000, accountId: 'card', toAccountId: 'cash' }),
      tx({ type: 'expense', amount: 500, accountId: 'card', categoryId: 'food' }),
      tx({ type: 'income', amount: 700, accountId: 'card', categoryId: 'salary' }),
    ]
    expect(sumByType(txs)).toEqual({ expense: 500, income: 700 })
  })

  it('архивные счета не входят в общий баланс', () => {
    const b = computeBalances(accounts, [])
    expect(totalBalance(accounts, b)).toBe(105000)
  })

  it('баланс может уйти в минус', () => {
    const b = computeBalances(accounts, [tx({ type: 'expense', amount: 9000, accountId: 'cash', categoryId: 'x' })])
    expect(b.get('cash')).toBe(-4000)
  })
})

describe('правка «Сейчас на счёте»', () => {
  it('пересчитывает начальный остаток так, чтобы текущий стал нужным', () => {
    const a = acc('card', 100000)
    const txs = [tx({ type: 'expense', amount: 30000, accountId: 'card', categoryId: 'x' })]
    const current = computeBalances([a], txs).get('card')!
    expect(current).toBe(70000)
    const newInitial = initialBalanceForTarget(a, current, 50000)
    expect(computeBalances([{ ...a, initialBalance: newInitial }], txs).get('card')).toBe(50000)
  })
})

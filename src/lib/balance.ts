import type { Account, Transaction } from '../db/types'

/**
 * Балансы счетов: начальный остаток + доходы − расходы ± переводы.
 * Возвращает словарь «id счёта → баланс в копейках».
 */
export function computeBalances(accounts: Account[], transactions: Transaction[]): Map<string, number> {
  const balances = new Map<string, number>()
  for (const a of accounts) balances.set(a.id, a.initialBalance)

  const add = (id: string | undefined, delta: number) => {
    if (id && balances.has(id)) balances.set(id, balances.get(id)! + delta)
  }

  for (const t of transactions) {
    if (t.type === 'income') add(t.accountId, t.amount)
    else if (t.type === 'expense') add(t.accountId, -t.amount)
    else {
      add(t.accountId, -t.amount)
      add(t.toAccountId, t.amount)
    }
  }
  return balances
}

/** Общий баланс по всем неархивным счетам. */
export function totalBalance(accounts: Account[], balances: Map<string, number>): number {
  return accounts.filter((a) => !a.archived).reduce((sum, a) => sum + (balances.get(a.id) ?? 0), 0)
}

/** Суммы расходов и доходов (переводы не считаются ни тем, ни другим). */
export function sumByType(transactions: Transaction[]): { expense: number; income: number } {
  let expense = 0
  let income = 0
  for (const t of transactions) {
    if (t.type === 'expense') expense += t.amount
    else if (t.type === 'income') income += t.amount
  }
  return { expense, income }
}

/**
 * Человек правит «Сколько сейчас на счёте», а храним мы начальный остаток.
 * Начальный = желаемый текущий − (текущий − начальный).
 */
export function initialBalanceForTarget(account: Account, currentBalance: number, target: number): number {
  return target - (currentBalance - account.initialBalance)
}

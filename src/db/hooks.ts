import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { computeBalances } from '../lib/balance'
import { DEFAULT_NOTICE_DAYS } from '../lib/subscriptions'
import { db } from './db'
import { getMeta, loadBudgetContext, META } from './repo'
import type { Account, Category, Transaction } from './types'

// Хуки читают данные из базы и сами обновляют экран при любых изменениях.
// Пока данные загружаются, возвращается undefined.

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(() => db.accounts.orderBy('order').toArray(), [])
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), [])
}

/** Все операции, новые сверху (по дате, затем по времени создания). */
export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.transactions.toArray()
    return all.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  }, [])
}

export function useLastAccountId(): string | undefined | null {
  return useLiveQuery(async () => (await getMeta<string>(META.lastAccountId)) ?? null, [])
}

export function useBalances(accounts?: Account[], transactions?: Transaction[]) {
  return useMemo(
    () => (accounts && transactions ? computeBalances(accounts, transactions) : undefined),
    [accounts, transactions],
  )
}

export function useById<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  return useMemo(() => new Map((list ?? []).map((x) => [x.id, x])), [list])
}

/** Всё для расчёта бюджетов; обновляется само при любых изменениях. */
export function useBudgetContext() {
  return useLiveQuery(() => loadBudgetContext(), [])
}

export function useCarryOverspend(): boolean | undefined {
  return useLiveQuery(async () => (await getMeta<boolean>(META.carryOverspend)) ?? false, [])
}

/** Подписки, ближайшие — сверху. */
export function useSubscriptions() {
  return useLiveQuery(() => db.subscriptions.orderBy('nextDate').toArray(), [])
}

/** За сколько дней напоминать о списании (по умолчанию 3). */
export function useNoticeDays(): number | undefined {
  return useLiveQuery(async () => (await getMeta<number>(META.subscriptionNoticeDays)) ?? DEFAULT_NOTICE_DAYS, [])
}

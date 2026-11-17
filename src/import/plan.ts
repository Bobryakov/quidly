// План импорта: что из выписки записать и как. Чистые функции — всё проверяется тестами.
//
// Для каждой строки выписки решаем:
//  • расход / доход / перевод на свой счёт (наличные, счёт другого банка);
//  • категорию (правило → категория банка → MCC → «Прочее»);
//  • статус: новая; уже импортирована (та же выписка второй раз); похожа на трату, внесённую вручную;
//    возврат, который гасит покупку из этой же выписки (обе не импортируются);
//  • не списание ли это подписки (тогда подписка считается проведённой).

import type { Account, Category, ImportRule, Subscription, Transaction } from '../db/types'
import { addDays } from '../lib/dates'
import { daysBetween } from '../lib/subscriptions'
import { categorize, type CategorySource } from './categorize'
import { merchantKey } from './normalize'
import type { ParsedRow, ParsedStatement } from './types'

export type ItemStatus = 'new' | 'duplicate' | 'possible-duplicate' | 'refund-pair'

export interface ImportItem {
  /** Уникальная метка строки выписки (для повторного импорта) */
  key: string
  row: ParsedRow
  kind: 'expense' | 'income' | 'transfer'
  /** Для расхода/дохода */
  categoryId?: string
  categorySource?: CategorySource
  /** Для перевода: второй (свой) счёт — куда ушли или откуда пришли деньги */
  counterAccountId?: string
  /** Комиссия, которая запишется отдельной тратой (например, за снятие наличных) */
  fee?: number
  status: ItemStatus
  /** Импортировать ли (галочка в предпросмотре) */
  include: boolean
  /** С какой операцией совпало («уже импортировано» / «похоже на дубль») */
  matchedTransactionId?: string
  /** Номер строки, с которой этот возврат взаимно погашен */
  pairedWith?: number
  /** Подписка, списание которой нашлось в выписке */
  subscriptionId?: string
}

export interface PlanInput {
  statement: ParsedStatement
  accountId: string
  accounts: Account[]
  categories: Category[]
  rules: ImportRule[]
  transactions: Transaction[]
  subscriptions: Subscription[]
}

/** Признаки банков в описаниях переводов: «Перевод в T-Bank», «Перевод из Альфа-Банка» */
const BANKS: { id: string; re: RegExp }[] = [
  { id: 'tbank', re: /t-?bank|т-?банк|тинькофф|tinkoff/i },
  { id: 'alfa', re: /альфа|alfa/i },
  // SBOL — «Сбербанк Онлайн»: переводы между своими счетами внутри Сбера
  { id: 'sber', re: /сбер|sber|sbol/i },
  { id: 'vtb', re: /втб|vtb/i },
  { id: 'ozon', re: /ozon|озон/i },
  { id: 'yandex', re: /яндекс.?банк|yandex.?bank/i },
  { id: 'gazprom', re: /газпромбанк|gazprombank/i },
  { id: 'raif', re: /райффайзен|raiffeisen/i },
]

const isRefund = (r: ParsedRow) => r.direction === 'in' && /возврат|отмена|refund/i.test(`${r.bankCategory ?? ''} ${r.description}`)
const isCashOut = (r: ParsedRow) => r.direction === 'out' && /выдача наличных|снятие наличных/i.test(r.bankCategory ?? '')
const isCashIn = (r: ParsedRow) => r.direction === 'in' && /внесение наличных|пополнение наличными/i.test(r.bankCategory ?? '')
const isTransferLike = (r: ParsedRow) => /перевод/i.test(`${r.bankCategory ?? ''} ${r.description}`)

/** Метка строки: банк, счёт, дата, время, направление, сумма, код авторизации, продавец (+ номер повтора). */
export function importKey(bank: string, accountId: string, r: ParsedRow): string {
  return [bank, accountId, r.date, r.time ?? '', r.direction, r.amount, r.authCode ?? '', merchantKey(r.description) || r.description].join('|')
}

/** Свой счёт для перевода: наличные или счёт банка из описания. */
function ownCounterAccount(r: ParsedRow, accountId: string, accounts: Account[]): string | undefined {
  const active = accounts.filter((a) => !a.archived && a.id !== accountId)
  if (isCashOut(r) || isCashIn(r)) return active.find((a) => a.type === 'cash')?.id
  if (!isTransferLike(r)) return undefined
  const bank = BANKS.find((b) => b.re.test(r.description))
  if (!bank) return undefined
  return active.find((a) => bank.re.test(a.name))?.id
}

export function buildPlan(input: PlanInput): ImportItem[] {
  const { statement, accountId, accounts, categories, rules, transactions, subscriptions } = input
  const rows = statement.rows
  const seen = new Map<string, number>()
  const byKey = new Map(transactions.filter((t) => t.importKey).map((t) => [t.importKey!, t]))

  // 1. Черновик каждой строки
  const items: ImportItem[] = rows.map((row) => {
    const base = importKey(statement.bank, accountId, row)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const key = n === 1 ? base : `${base}#${n}`

    const counter = ownCounterAccount(row, accountId, accounts)
    const kind: ImportItem['kind'] = counter ? 'transfer' : row.direction === 'out' ? 'expense' : 'income'
    const item: ImportItem = { key, row, kind, status: 'new', include: true }
    if (counter) {
      item.counterAccountId = counter
      if (row.fee && row.fee < row.amount && isCashOut(row)) item.fee = row.fee
    } else {
      const c = categorize(row, kind as 'expense' | 'income', categories, rules)
      item.categoryId = c.categoryId
      item.categorySource = c.source
    }
    const dup = byKey.get(key)
    if (dup) Object.assign(item, { status: 'duplicate', include: false, matchedTransactionId: dup.id })
    return item
  })

  // 2. Возвраты: гасят покупку с тем же продавцом и суммой из этой же выписки (сначала — с тем же кодом авторизации)
  items.forEach((refund, i) => {
    if (refund.status !== 'new' || !isRefund(refund.row)) return
    const key = merchantKey(refund.row.description)
    const candidates = items
      .map((it, j) => ({ it, j }))
      .filter(
        ({ it }) =>
          it.status === 'new' &&
          it.row.direction === 'out' &&
          it.row.amount === refund.row.amount &&
          merchantKey(it.row.description) === key &&
          it.row.date <= refund.row.date,
      )
      .sort((a, b) => Number(b.it.row.authCode === refund.row.authCode) - Number(a.it.row.authCode === refund.row.authCode))
    const match = candidates[0]
    if (!match) return
    Object.assign(refund, { status: 'refund-pair', include: false, pairedWith: match.j })
    Object.assign(match.it, { status: 'refund-pair', include: false, pairedWith: i })
  })

  // 3. Похоже на операцию, внесённую вручную: тот же счёт и сумма, тот же тип, ±1 день
  const manual = transactions.filter((t) => !t.importKey)
  const used = new Set<string>()
  for (const it of items) {
    if (it.status !== 'new') continue
    const amount = it.kind === 'transfer' && it.fee ? it.row.amount - it.fee : it.row.amount
    const match = manual.find((t) => {
      if (used.has(t.id) || (t.amount !== amount && t.amount !== it.row.amount)) return false
      if (Math.abs(daysBetween(t.date, it.row.date)) > 1) return false
      if (it.kind === 'transfer') {
        return t.type === 'transfer' && [t.accountId, t.toAccountId].includes(accountId) && [t.accountId, t.toAccountId].includes(it.counterAccountId)
      }
      return t.type === it.kind && t.accountId === accountId
    })
    if (match) {
      used.add(match.id)
      Object.assign(it, { status: 'possible-duplicate', include: false, matchedTransactionId: match.id })
    }
  }

  // 4. Списание подписки: та же сумма, ±3 дня от ожидаемой даты
  const subsUsed = new Set<string>()
  for (const it of items) {
    if (it.status !== 'new' || it.kind !== 'expense') continue
    const sub = subscriptions.find(
      (s) =>
        !s.paused &&
        !subsUsed.has(s.id) &&
        s.amount === it.row.amount &&
        it.row.date >= addDays(s.nextDate, -3) &&
        it.row.date <= addDays(s.nextDate, 3),
    )
    if (sub) {
      subsUsed.add(sub.id)
      it.subscriptionId = sub.id
      it.categoryId = sub.categoryId
      it.categorySource = 'rule'
    }
  }

  return items
}

/** Сводка для шапки предпросмотра. */
export function planSummary(items: ImportItem[]) {
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length
  return {
    total: items.length,
    selected: items.filter((i) => i.include).length,
    duplicates: count('duplicate'),
    possible: count('possible-duplicate'),
    refunds: count('refund-pair'),
    transfers: items.filter((i) => i.kind === 'transfer' && i.include).length,
  }
}

/** Человек поправил категорию строки → она же у всех строк этого продавца (кроме уже исправленных правилом подписки). */
export function applyCategoryChoice(items: ImportItem[], index: number, categoryId: string): { items: ImportItem[]; pattern: string } {
  const pattern = merchantKey(items[index].row.description)
  const kind = items[index].kind
  return {
    pattern,
    items: items.map((it, i) =>
      i === index || (pattern && it.kind === kind && !it.subscriptionId && merchantKey(it.row.description) === pattern)
        ? { ...it, categoryId, categorySource: 'rule' }
        : it,
    ),
  }
}

/** Переключатель «перевод ↔ расход/доход» для строки предпросмотра. */
export function toggleTransfer(
  item: ImportItem,
  accountId: string,
  accounts: Account[],
  categories: Category[],
  rules: ImportRule[],
): ImportItem {
  if (item.kind === 'transfer') {
    const kind = item.row.direction === 'out' ? 'expense' : 'income'
    const c = categorize(item.row, kind, categories, rules)
    return { ...item, kind, categoryId: c.categoryId, categorySource: c.source, counterAccountId: undefined, fee: undefined }
  }
  const counter = accounts.find((a) => !a.archived && a.id !== accountId)
  if (!counter) return item
  return { ...item, kind: 'transfer', counterAccountId: counter.id, categoryId: undefined, categorySource: undefined }
}

/**
 * Баланс счёта на дату после импорта: начальный остаток + все операции по дату включительно
 * (уже записанные + отмеченные в предпросмотре).
 */
export function balanceAfterImport(account: Account, transactions: Transaction[], items: ImportItem[], upTo: string): number {
  let sum = account.initialBalance
  const id = account.id
  for (const t of transactions) {
    if (t.date > upTo) continue
    if (t.type === 'income' && t.accountId === id) sum += t.amount
    else if (t.type === 'expense' && t.accountId === id) sum -= t.amount
    else if (t.type === 'transfer') {
      if (t.accountId === id) sum -= t.amount
      if (t.toAccountId === id) sum += t.amount
    }
  }
  for (const it of items) {
    if (!it.include || it.row.date > upTo) continue
    // все строки выписки относятся к счёту импорта: поступление +, списание − (комиссия уже внутри суммы)
    sum += it.row.direction === 'in' ? it.row.amount : -it.row.amount
  }
  return sum
}

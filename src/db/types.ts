// Типы данных, которые хранятся в базе на устройстве.
// Все суммы — в копейках (целые числа, всегда положительные; знак задаёт тип операции).

export type AccountType = 'card' | 'cash' | 'deposit'

export interface Account {
  id: string
  name: string
  type: AccountType
  emoji: string
  color: string
  /** Остаток на момент начала учёта, в копейках (может быть отрицательным, например у кредитки). */
  initialBalance: number
  archived: boolean
  order: number
  createdAt: number
}

export type CategoryKind = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  emoji: string
  color: string
  order: number
  createdAt: number
}

export type TransactionType = 'expense' | 'income' | 'transfer'

export interface Transaction {
  id: string
  type: TransactionType
  /** Сумма в копейках, > 0 */
  amount: number
  /** Дата операции по местному времени: 'ГГГГ-ММ-ДД' */
  date: string
  /** Счёт списания/зачисления. Для перевода — счёт, с которого переводят. */
  accountId: string
  /** Только для перевода — счёт, на который переводят. */
  toAccountId?: string
  /** Для расхода и дохода. У перевода категории нет. */
  categoryId?: string
  comment?: string
  createdAt: number
  updatedAt: number
}

export interface MetaRecord {
  key: string
  value: unknown
}

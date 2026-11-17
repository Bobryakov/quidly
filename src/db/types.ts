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
  /** Переносить неистраченный остаток бюджета на следующий месяц (по умолчанию — да). */
  budgetRollover?: boolean
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
  /** Если операция записана кнопкой «Проведено» у подписки (схема v3) */
  subscriptionId?: string
  /** Метка импорта из выписки — по ней повторный импорт той же выписки ничего не задваивает (схема v5) */
  importKey?: string
  createdAt: number
  updatedAt: number
}

export interface MetaRecord {
  key: string
  value: unknown
}

// ---------- бюджеты (схема v2) ----------

/** Особый «id категории» для общего месячного лимита. */
export const TOTAL_BUDGET = 'total'

/**
 * Лимит категории (или общий), действующий с месяца `fromMonth` и до следующей записи.
 * limit = null — бюджет снят с этого месяца.
 */
export interface BudgetRecord {
  id: string
  categoryId: string
  /** В копейках; null — бюджета нет */
  limit: number | null
  /** 'ГГГГ-ММ' */
  fromMonth: string
}

/** Что сделать с остатком категории при закрытии месяца. */
export type CloseAction =
  | { type: 'carry' }
  | { type: 'reset' }
  | { type: 'cover'; to: string }
  /** Остаток — в копилку (этап 5) */
  | { type: 'goal'; goalId: string }

/** Итоги закрытого месяца: решения и рассчитанные переносы на следующий месяц. */
export interface MonthClosing {
  /** Закрытый месяц 'ГГГГ-ММ' */
  month: string
  closedAt: number
  /** true — закрыт автоматически (через 7 дней без решения) */
  auto: boolean
  actions: Record<string, CloseAction>
  /** Сколько переходит в лимит следующего месяца по каждой категории (копейки, может быть < 0) */
  carries: Record<string, number>
  /** Сколько перерасхода каждой категории покрыто остатками других */
  covered: Record<string, number>
  /** Какой остаток какой категории ушёл в копилку (этап 5): id категории → { копилка, сумма } */
  toGoals?: Record<string, { goalId: string; amount: number }>
}

// ---------- подписки (схема v3) ----------

export type SubscriptionPeriod = 'week' | 'month' | 'quarter' | 'year'

export interface Subscription {
  id: string
  name: string
  /** Сумма списания в копейках, > 0 */
  amount: number
  period: SubscriptionPeriod
  /** Дата ближайшего ещё не отмеченного списания 'ГГГГ-ММ-ДД' */
  nextDate: string
  /**
   * Число месяца, в которое списывают (1–31). Нужно, чтобы подписка «на 31-е»
   * в феврале списалась 28-го, а в марте снова 31-го.
   */
  anchorDay: number
  accountId: string
  /** Расходная категория */
  categoryId: string
  /** На паузе — не напоминаем и не считаем в сумму за месяц */
  paused: boolean
  createdAt: number
}

// ---------- копилки (схема v4) ----------

/** Цель-копилка. Деньги «виртуальные»: балансы счетов не меняются. */
export interface Goal {
  id: string
  name: string
  emoji: string
  color: string
  /** Сколько хотим накопить, копейки > 0 */
  target: number
  /** Срок 'ГГГГ-ММ-ДД' — необязательный */
  deadline?: string
  /** Когда цель впервые достигнута (для конфетти и бейджа) */
  achievedAt?: number
  createdAt: number
}

/** Движение по копилке: пополнение (+) или снятие (−). */
export interface GoalMove {
  id: string
  goalId: string
  /** Копейки: > 0 — пополнение, < 0 — снятие */
  amount: number
  date: string
  comment?: string
  /** Откуда: вручную или из «Итогов месяца» */
  source: 'manual' | 'closing'
  createdAt: number
}

// ---------- правила импорта (схема v5) ----------

/** «PYATEROCHKA» → Продукты: запоминается, когда человек поправил категорию при импорте. */
export interface ImportRule {
  id: string
  /** Ключ продавца (см. merchantKey): описание операции должно его содержать */
  pattern: string
  categoryId: string
  createdAt: number
}

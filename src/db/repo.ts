import { db } from './db'
import { budgetFor, closeMonth, defaultActions, monthsToAutoClose, type BudgetContext } from '../lib/budget'
import { monthLower } from '../lib/dates'
import { goalBalances, justAchieved } from '../lib/goals'
import { nextChargeDate } from '../lib/subscriptions'
import type {
  Account,
  AccountType,
  Category,
  CategoryKind,
  CloseAction,
  Goal,
  MonthClosing,
  SubscriptionPeriod,
  Transaction,
  TransactionType,
} from './types'

// Все изменения данных идут через эти функции — так проверки в одном месте.

export function newId(): string {
  return crypto.randomUUID()
}

// ---------- служебные настройки ----------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export const META = {
  lastAccountId: 'lastAccountId',
  /** Переносить перерасход бюджета минусом на следующий месяц (по умолчанию — нет) */
  carryOverspend: 'carryOverspend',
  /** За сколько дней напоминать о списании подписки (1 / 3 / 7, по умолчанию 3) */
  subscriptionNoticeDays: 'subscriptionNoticeDays',
} as const

// ---------- счета ----------

export type AccountInput = {
  name: string
  type: AccountType
  emoji: string
  color: string
  initialBalance: number
}

function checkAccount(a: AccountInput) {
  if (!a.name.trim()) throw new Error('Название счёта не может быть пустым')
  if (!Number.isInteger(a.initialBalance)) throw new Error('Остаток должен быть в копейках')
}

export async function createAccount(input: AccountInput): Promise<string> {
  checkAccount(input)
  const id = newId()
  const order = await db.accounts.count()
  await db.accounts.add({
    ...input,
    name: input.name.trim(),
    id,
    archived: false,
    order,
    createdAt: Date.now(),
  })
  return id
}

export async function updateAccount(id: string, patch: Partial<AccountInput & { archived: boolean }>) {
  const current = await db.accounts.get(id)
  if (!current) throw new Error('Счёт не найден')
  const next = { ...current, ...patch }
  checkAccount(next)
  await db.accounts.put({ ...next, name: next.name.trim() })
}

export async function accountUsageCount(id: string): Promise<number> {
  const [a, b] = await Promise.all([
    db.transactions.where('accountId').equals(id).count(),
    db.transactions.where('toAccountId').equals(id).count(),
  ])
  return a + b
}

/** Удалить можно только счёт без операций. Счёт с операциями — архивировать. */
export async function deleteAccount(id: string): Promise<void> {
  if ((await accountUsageCount(id)) > 0) {
    throw new Error('У счёта есть операции — его можно только убрать в архив')
  }
  if ((await db.subscriptions.where('accountId').equals(id).count()) > 0) {
    throw new Error('К счёту привязаны подписки — сначала смените у них счёт')
  }
  await db.accounts.delete(id)
}

/** Первый запуск: создаём счета, которые человек заполнил на экране знакомства. */
export async function finishOnboarding(accounts: AccountInput[]): Promise<void> {
  if (accounts.length === 0) throw new Error('Нужен хотя бы один счёт')
  accounts.forEach(checkAccount)
  const now = Date.now()
  await db.transaction('rw', db.accounts, db.meta, async () => {
    const records: Account[] = accounts.map((a, i) => ({
      ...a,
      name: a.name.trim(),
      id: newId(),
      archived: false,
      order: i,
      createdAt: now,
    }))
    await db.accounts.bulkAdd(records)
    await db.meta.put({ key: META.lastAccountId, value: records[0].id })
  })
}

// ---------- операции ----------

export type TransactionInput = {
  type: TransactionType
  amount: number
  date: string
  accountId: string
  toAccountId?: string
  categoryId?: string
  comment?: string
  subscriptionId?: string
}

async function checkTransaction(t: TransactionInput): Promise<void> {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('Введите сумму больше нуля')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) throw new Error('Неверная дата')
  if (!(await db.accounts.get(t.accountId))) throw new Error('Счёт не найден')

  if (t.type === 'transfer') {
    if (!t.toAccountId || !(await db.accounts.get(t.toAccountId))) throw new Error('Выберите счёт, куда переводить')
    if (t.toAccountId === t.accountId) throw new Error('Перевод на тот же самый счёт не имеет смысла')
    if (t.categoryId) throw new Error('У перевода не бывает категории')
  } else {
    const cat = t.categoryId ? await db.categories.get(t.categoryId) : undefined
    if (!cat) throw new Error('Выберите категорию')
    if (cat.kind !== t.type) throw new Error('Категория не подходит к типу операции')
    if (t.toAccountId) throw new Error('Счёт «куда» бывает только у перевода')
  }
}

function clean(t: TransactionInput): TransactionInput {
  const comment = t.comment?.trim()
  return {
    type: t.type,
    amount: t.amount,
    date: t.date,
    accountId: t.accountId,
    ...(t.type === 'transfer' ? { toAccountId: t.toAccountId } : { categoryId: t.categoryId }),
    ...(comment ? { comment } : {}),
    ...(t.subscriptionId ? { subscriptionId: t.subscriptionId } : {}),
  }
}

export async function addTransaction(input: TransactionInput): Promise<string> {
  const t = clean(input)
  await checkTransaction(t)
  const id = newId()
  const now = Date.now()
  await db.transaction('rw', db.transactions, db.meta, async () => {
    await db.transactions.add({ ...t, id, createdAt: now, updatedAt: now })
    await db.meta.put({ key: META.lastAccountId, value: t.accountId })
  })
  return id
}

export async function updateTransaction(id: string, input: TransactionInput): Promise<void> {
  const current = await db.transactions.get(id)
  if (!current) throw new Error('Операция не найдена')
  const t = clean(input)
  await checkTransaction(t)
  await db.transactions.put({ ...t, id, createdAt: current.createdAt, updatedAt: Date.now() })
}

/** Удаляет операцию и возвращает её — чтобы можно было «Отменить». */
export async function deleteTransaction(id: string): Promise<Transaction | undefined> {
  const t = await db.transactions.get(id)
  if (t) await db.transactions.delete(id)
  return t
}

export async function restoreTransaction(t: Transaction): Promise<void> {
  await db.transactions.put(t)
}

// ---------- категории ----------

export type CategoryInput = { name: string; kind: CategoryKind; emoji: string; color: string }

export async function createCategory(input: CategoryInput): Promise<string> {
  if (!input.name.trim()) throw new Error('Название категории не может быть пустым')
  const id = newId()
  const order = await db.categories.where('kind').equals(input.kind).count()
  await db.categories.add({ ...input, name: input.name.trim(), id, order, createdAt: Date.now() })
  return id
}

/** Переименовать, сменить эмодзи или цвет. Тип (расход/доход) не меняется. */
export async function updateCategory(
  id: string,
  patch: Partial<Omit<CategoryInput, 'kind'>> & { budgetRollover?: boolean },
) {
  const current = await db.categories.get(id)
  if (!current) throw new Error('Категория не найдена')
  const next: Category = { ...current, ...patch }
  if (!next.name.trim()) throw new Error('Название категории не может быть пустым')
  await db.categories.put({ ...next, name: next.name.trim() })
}

export async function categoryUsageCount(id: string): Promise<number> {
  return db.transactions.where('categoryId').equals(id).count()
}

/**
 * Объединение: все операции категории `fromId` переходят в `toId`, а `fromId` удаляется.
 * Позже (бюджеты, подписки, правила импорта) сюда добавится перенос и для них.
 */
export async function mergeCategories(fromId: string, toId: string): Promise<number> {
  if (fromId === toId) throw new Error('Нельзя объединить категорию саму с собой')
  return db.transaction('rw', [db.categories, db.transactions, db.budgets, db.subscriptions], async () => {
    const [from, to] = await Promise.all([db.categories.get(fromId), db.categories.get(toId)])
    if (!from || !to) throw new Error('Категория не найдена')
    if (from.kind !== to.kind) throw new Error('Объединять можно только расходы с расходами, доходы с доходами')
    const moved = await db.transactions
      .where('categoryId')
      .equals(fromId)
      .modify({ categoryId: toId, updatedAt: Date.now() })
    // Бюджет: если у категории-получателя своего бюджета нет — он переходит к ней,
    // иначе остаётся бюджет получателя, а бюджет исходной категории удаляется.
    const targetHasBudget = (await db.budgets.where('categoryId').equals(toId).count()) > 0
    if (targetHasBudget) await db.budgets.where('categoryId').equals(fromId).delete()
    else await db.budgets.where('categoryId').equals(fromId).modify({ categoryId: toId })
    await db.subscriptions.where('categoryId').equals(fromId).modify({ categoryId: toId })
    await db.categories.delete(fromId)
    return moved
  })
}

/** Удалить можно только пустую категорию; с операциями — через объединение. */
export async function deleteCategory(id: string): Promise<void> {
  if ((await categoryUsageCount(id)) > 0) {
    throw new Error('В категории есть операции — сначала перенесите их в другую категорию')
  }
  if ((await db.subscriptions.where('categoryId').equals(id).count()) > 0) {
    throw new Error('В категории есть подписки — объедините её с другой категорией')
  }
  const cat = await db.categories.get(id)
  if (cat && (await db.categories.where('kind').equals(cat.kind).count()) <= 1) {
    throw new Error('Должна остаться хотя бы одна категория')
  }
  await db.categories.delete(id)
}

// ---------- бюджеты ----------

/**
 * Задать лимит категории (или общий — categoryId = TOTAL_BUDGET) начиная с месяца `month`.
 * limit = null — убрать бюджет с этого месяца. Прошлые месяцы не меняются.
 */
export async function setBudget(categoryId: string, limit: number | null, month: string): Promise<void> {
  if (limit !== null && (!Number.isInteger(limit) || limit < 0)) throw new Error('Лимит должен быть не меньше нуля')
  await db.transaction('rw', db.budgets, async () => {
    const same = await db.budgets.where('categoryId').equals(categoryId).filter((r) => r.fromMonth === month).first()
    if (same) await db.budgets.update(same.id, { limit })
    else await db.budgets.add({ id: newId(), categoryId, limit, fromMonth: month })
  })
}

/** Всё, что нужно для расчёта бюджета, одним снимком из базы. */
export async function loadBudgetContext(): Promise<BudgetContext> {
  const [records, transactions, categories, closings, carryOverspend] = await Promise.all([
    db.budgets.toArray(),
    db.transactions.toArray(),
    db.categories.orderBy('order').toArray(),
    db.closings.toArray(),
    getMeta<boolean>(META.carryOverspend),
  ])
  const expense = categories.filter((c) => c.kind === 'expense')
  return {
    records,
    transactions,
    categoryIds: expense.map((c) => c.id),
    closings: new Map(closings.map((c) => [c.month, c])),
    rolloverOff: new Set(expense.filter((c) => c.budgetRollover === false).map((c) => c.id)),
    carryOverspend: carryOverspend ?? false,
  }
}

/** Закрыть месяц: записать решения по остаткам и рассчитанные переносы; остатки «в копилку» — пополнить копилки. */
export async function closeBudgetMonth(
  month: string,
  actions?: Record<string, CloseAction>,
  auto = false,
): Promise<MonthClosing & { achievedGoals: string[] }> {
  return db.transaction('rw', [db.budgets, db.transactions, db.categories, db.closings, db.meta, db.goals, db.goalMoves], async () => {
    const ctx = await loadBudgetContext()
    if (ctx.closings.has(month)) throw new Error('Итоги этого месяца уже подведены')
    const mb = budgetFor(ctx, month)
    const chosen = { ...(actions ?? defaultActions(mb, ctx.rolloverOff)) }
    // Если копилку успели удалить — остаток просто переносится
    for (const [catId, a] of Object.entries(chosen)) {
      if (a.type === 'goal' && !(await db.goals.get(a.goalId))) chosen[catId] = { type: 'carry' }
    }
    const closing: MonthClosing = {
      month,
      closedAt: Date.now(),
      auto,
      actions: chosen,
      ...closeMonth(mb, chosen, ctx),
    }
    await db.closings.add(closing)

    const achievedGoals: string[] = []
    for (const [catId, { goalId, amount }] of Object.entries(closing.toGoals ?? {})) {
      const cat = await db.categories.get(catId)
      // Пополнение записывается последним днём закрытого месяца
      const { achieved } = await addGoalMove(goalId, amount, `${month}-${lastDay(month)}`, {
        comment: `Остаток «${cat?.name ?? 'категории'}» за ${monthLower(month)}`,
        source: 'closing',
      })
      if (achieved) achievedGoals.push(goalId)
    }
    return { ...closing, achievedGoals }
  })
}

function lastDay(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return String(new Date(y, m, 0).getDate()).padStart(2, '0')
}

/** При запуске: закрыть по умолчанию месяцы, по которым никто не принял решение (через 7 дней). */
export async function autoCloseMonths(today: string): Promise<string[]> {
  const ctx = await loadBudgetContext()
  const months = monthsToAutoClose(ctx, today)
  for (const m of months) await closeBudgetMonth(m, undefined, true)
  return months
}

// ---------- подписки ----------

export type SubscriptionInput = {
  name: string
  amount: number
  period: SubscriptionPeriod
  nextDate: string
  accountId: string
  categoryId: string
  paused?: boolean
}

async function checkSubscription(s: SubscriptionInput) {
  if (!s.name.trim()) throw new Error('Впишите название')
  if (!Number.isInteger(s.amount) || s.amount <= 0) throw new Error('Введите сумму больше нуля')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.nextDate)) throw new Error('Неверная дата')
  if (!(await db.accounts.get(s.accountId))) throw new Error('Выберите счёт')
  const cat = await db.categories.get(s.categoryId)
  if (!cat || cat.kind !== 'expense') throw new Error('Выберите категорию расходов')
}

export async function createSubscription(input: SubscriptionInput): Promise<string> {
  await checkSubscription(input)
  const id = newId()
  await db.subscriptions.add({
    ...input,
    name: input.name.trim(),
    id,
    anchorDay: Number(input.nextDate.slice(8, 10)),
    paused: input.paused ?? false,
    createdAt: Date.now(),
  })
  return id
}

export async function updateSubscription(id: string, input: SubscriptionInput): Promise<void> {
  const current = await db.subscriptions.get(id)
  if (!current) throw new Error('Подписка не найдена')
  await checkSubscription(input)
  await db.subscriptions.put({
    ...current,
    ...input,
    name: input.name.trim(),
    // если дату поменяли вручную — новое «число месяца» берём из неё
    anchorDay: input.nextDate !== current.nextDate ? Number(input.nextDate.slice(8, 10)) : current.anchorDay,
    paused: input.paused ?? current.paused,
  })
}

/** Удаляет подписку. Уже записанные по ней операции остаются. */
export async function deleteSubscription(id: string): Promise<void> {
  await db.subscriptions.delete(id)
}

/**
 * «Проведено»: записывает трату по подписке и сдвигает дату следующего списания.
 * Дата траты — дата списания (но не позже сегодняшнего дня, если отметили заранее).
 */
export async function markSubscriptionPaid(
  id: string,
  today: string,
): Promise<{ transactionId: string; prevNextDate: string }> {
  return db.transaction('rw', [db.subscriptions, db.transactions, db.accounts, db.categories, db.meta], async () => {
    const s = await db.subscriptions.get(id)
    if (!s) throw new Error('Подписка не найдена')
    const transactionId = await addTransaction({
      type: 'expense',
      amount: s.amount,
      date: s.nextDate <= today ? s.nextDate : today,
      accountId: s.accountId,
      categoryId: s.categoryId,
      comment: s.name,
      subscriptionId: s.id,
    })
    await db.subscriptions.update(id, { nextDate: nextChargeDate(s.nextDate, s.period, s.anchorDay) })
    return { transactionId, prevNextDate: s.nextDate }
  })
}

/** «Пропустить»: это списание не состоялось — просто сдвигаем дату. */
export async function skipSubscriptionCharge(id: string): Promise<string> {
  const s = await db.subscriptions.get(id)
  if (!s) throw new Error('Подписка не найдена')
  await db.subscriptions.update(id, { nextDate: nextChargeDate(s.nextDate, s.period, s.anchorDay) })
  return s.nextDate
}

/** Отмена «Проведено» / «Пропустить»: вернуть дату и (если была) удалить записанную трату. */
export async function undoSubscriptionCharge(id: string, prevNextDate: string, transactionId?: string): Promise<void> {
  await db.transaction('rw', db.subscriptions, db.transactions, async () => {
    if (transactionId) await db.transactions.delete(transactionId)
    await db.subscriptions.update(id, { nextDate: prevNextDate })
  })
}

// ---------- копилки ----------

export type GoalInput = { name: string; emoji: string; color: string; target: number; deadline?: string }

function checkGoal(g: GoalInput) {
  if (!g.name.trim()) throw new Error('Впишите название цели')
  if (!Number.isInteger(g.target) || g.target <= 0) throw new Error('Впишите, сколько нужно накопить')
  if (g.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(g.deadline)) throw new Error('Неверная дата')
}

export async function createGoal(input: GoalInput): Promise<string> {
  checkGoal(input)
  const id = newId()
  await db.goals.add({
    id,
    name: input.name.trim(),
    emoji: input.emoji,
    color: input.color,
    target: input.target,
    ...(input.deadline ? { deadline: input.deadline } : {}),
    createdAt: Date.now(),
  })
  return id
}

export async function updateGoal(id: string, input: GoalInput): Promise<void> {
  const current = await db.goals.get(id)
  if (!current) throw new Error('Цель не найдена')
  checkGoal(input)
  const next: Goal = { ...current, name: input.name.trim(), emoji: input.emoji, color: input.color, target: input.target }
  if (input.deadline) next.deadline = input.deadline
  else delete next.deadline
  await db.goals.put(next)
}

/** Удалить копилку вместе с историей. Деньги на счетах не меняются — копилки виртуальные. */
export async function deleteGoal(id: string): Promise<void> {
  await db.transaction('rw', db.goals, db.goalMoves, async () => {
    await db.goalMoves.where('goalId').equals(id).delete()
    await db.goals.delete(id)
  })
}

export async function goalBalance(goalId: string): Promise<number> {
  return goalBalances(await db.goalMoves.where('goalId').equals(goalId).toArray()).get(goalId) ?? 0
}

/**
 * Пополнение (amount > 0) или снятие (amount < 0). Снять больше, чем лежит, нельзя.
 * achieved = true, если этим пополнением цель впервые достигнута.
 */
export async function addGoalMove(
  goalId: string,
  amount: number,
  date: string,
  opts: { comment?: string; source?: 'manual' | 'closing' } = {},
): Promise<{ moveId: string; achieved: boolean }> {
  if (!Number.isInteger(amount) || amount === 0) throw new Error('Введите сумму')
  return db.transaction('rw', db.goals, db.goalMoves, async () => {
    const goal = await db.goals.get(goalId)
    if (!goal) throw new Error('Цель не найдена')
    const before = await goalBalance(goalId)
    if (before + amount < 0) throw new Error('Столько в копилке нет')
    const moveId = newId()
    const comment = opts.comment?.trim()
    await db.goalMoves.add({
      id: moveId,
      goalId,
      amount,
      date,
      ...(comment ? { comment } : {}),
      source: opts.source ?? 'manual',
      createdAt: Date.now(),
    })
    const achieved = !goal.achievedAt && justAchieved(before, before + amount, goal.target)
    if (achieved) await db.goals.update(goalId, { achievedAt: Date.now() })
    return { moveId, achieved }
  })
}

/** Отменить движение (кнопка «Отменить» в плашке). Отметка «цель достигнута» остаётся. */
export async function deleteGoalMove(moveId: string): Promise<void> {
  await db.goalMoves.delete(moveId)
}

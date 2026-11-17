import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { db } from './db/db'
import { addTransaction, finishOnboarding, setBudget } from './db/repo'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

const CAFE = 'seed-expense-2'
const BUS = 'seed-expense-3'
const NBSP = '\u0020'

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

async function tapCategory(name: RegExp) {
  const sheet = await screen.findByRole('dialog', { name: 'Быстрый ввод' })
  fireEvent.click(await within(sheet).findByRole('button', { name }))
}

async function press(...keys: string[]) {
  const pad = await screen.findByRole('group', { name: 'Клавиатура суммы' })
  for (const k of keys) fireEvent.click(within(pad).getByRole('button', { name: k }))
}

let accountId = ''
beforeEach(async () => {
  // «Сегодня» в тестах — 3 ноября 2026 (подменяем только часы, таймеры настоящие)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0))
  await resetDb()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  await finishOnboarding([{ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 10000000 }])
  accountId = (await db.accounts.toArray())[0].id
})

afterEach(() => {
  vi.useRealTimers()
})

describe('бюджеты: экран', () => {
  it('задать лимит категории — он виден на экране бюджетов и на главной', async () => {
    renderAt('/budgets')
    fireEvent.click(await screen.findByRole('button', { name: /Кафе.*\+ лимит/ }))
    fireEvent.change(await screen.findByLabelText('Лимит в месяц'), { target: { value: '3 000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(async () => expect(await db.budgets.count()).toBe(1))
    await waitFor(() => expect(screen.getByRole('button', { name: /Кафе/ })).toHaveTextContent(`из 3${NBSP}000${NBSP}₽`))

    const nav = screen.getByRole('navigation', { name: 'Основное меню' })
    fireEvent.click(within(nav).getByRole('link', { name: /Главная/ }))
    expect(await screen.findByRole('link', { name: 'Бюджет месяца' })).toHaveTextContent('Бюджет на ноябрь')
  })

  it('без бюджетов на главной — приглашение задать бюджет', async () => {
    renderAt('/')
    expect(await screen.findByText('Задайте бюджет')).toBeInTheDocument()
  })
})

describe('бюджеты: предупреждения после траты', () => {
  it('80% — жёлтое предупреждение, сверх лимита — красное', async () => {
    await setBudget(CAFE, 100000, '2026-11')
    renderAt('/')

    fireEvent.click(await screen.findByRole('button', { name: 'Добавить операцию' }))
    await press('8', '5', '0')
    await tapCategory(/Кафе/)
    expect(await screen.findByRole('status')).toHaveTextContent('Кафе: потрачено 85% лимита')

    fireEvent.click(await screen.findByRole('button', { name: 'Добавить операцию' }))
    await press('2', '0', '0')
    await tapCategory(/Кафе/)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`Кафе: лимит превышен на 50${NBSP}₽`))
  })
})

describe('итоги месяца', () => {
  it('в начале месяца — карточка «Итоги октября»; «Покрыть перерасход» записывается', async () => {
    await setBudget(CAFE, 300000, '2026-10')
    await setBudget(BUS, 200000, '2026-10')
    await addTransaction({ type: 'expense', amount: 250000, date: '2026-10-05', accountId, categoryId: CAFE })
    await addTransaction({ type: 'expense', amount: 280000, date: '2026-10-06', accountId, categoryId: BUS })

    renderAt('/')
    const card = await screen.findByRole('region', { name: 'Итоги месяца' })
    expect(card).toHaveTextContent('Итоги октября')
    expect(card).toHaveTextContent(`остаток 500${NBSP}₽`)
    expect(card).toHaveTextContent(`перерасход 800${NBSP}₽`)

    const cafeChoice = within(card).getByRole('radiogroup', { name: /Кафе/ })
    fireEvent.click(within(cafeChoice).getByRole('radio', { name: /Покрыть/ }))
    expect(card).toHaveTextContent(`покрыто 500${NBSP}₽`)
    fireEvent.click(within(card).getByRole('button', { name: /Применить/ }))

    await waitFor(async () => expect(await db.closings.get('2026-10')).toBeTruthy())
    const closing = await db.closings.get('2026-10')
    expect(closing).toMatchObject({ auto: false, covered: { [BUS]: 50000 }, carries: {} })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Итоги месяца' })).not.toBeInTheDocument())
  })
})

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { db } from './db/db'
import { finishOnboarding } from './db/repo'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

const NBSP = ' '

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

async function withAccounts() {
  await finishOnboarding([
    { name: 'Карта', type: 'card', emoji: '💳', color: '#3b82f6', initialBalance: 1000000 },
    { name: 'Наличные', type: 'cash', emoji: '💵', color: '#22c55e', initialBalance: 50000 },
  ])
}

const balanceText = () => screen.getByLabelText('Общий баланс').textContent

async function press(...keys: string[]) {
  const pad = await screen.findByRole('group', { name: 'Клавиатура суммы' })
  for (const k of keys) fireEvent.click(within(pad).getByRole('button', { name: k }))
}

beforeEach(async () => {
  await resetDb()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  document.documentElement.classList.remove('dark')
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  )
})

describe('первый запуск', () => {
  it('показывает знакомство и после «Начать» — главную с балансом', async () => {
    renderAt('/')
    expect(await screen.findByText('Привет! Это Quidly')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Остаток: Карта'), { target: { value: '12 345,67' } })
    fireEvent.change(screen.getByLabelText('Остаток: Наличные'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /Начать/ }))
    await waitFor(() => expect(balanceText()).toBe(`12${NBSP}845,67${NBSP}₽`))
    expect(await db.accounts.count()).toBe(2)
  })

  it('не принимает непонятную сумму', async () => {
    renderAt('/')
    fireEvent.change(await screen.findByLabelText('Остаток: Карта'), { target: { value: 'много' } })
    fireEvent.click(screen.getByRole('button', { name: /Начать/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не получается прочитать сумму')
    expect(await db.accounts.count()).toBe(0)
  })
})

describe('быстрый ввод', () => {
  beforeEach(withAccounts)

  it('«+» → сумма → категория = трата сохранена', async () => {
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить операцию' }))
    await press('3', '5', '0')
    expect(screen.getByLabelText('Сумма')).toHaveTextContent('350')
    fireEvent.click(await screen.findByRole('button', { name: /Продукты/ }))

    await waitFor(() => expect(balanceText()).toBe(`10${NBSP}150,00${NBSP}₽`))
    const [t] = await db.transactions.toArray()
    expect(t).toMatchObject({ type: 'expense', amount: 35000, categoryId: 'seed-expense-1' })
    expect(await screen.findByRole('status')).toHaveTextContent('Продукты')
  })

  it('без суммы категорию не сохраняет и подсказывает', async () => {
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить операцию' }))
    fireEvent.click(await screen.findByRole('button', { name: /Кафе/ }))
    expect(await screen.findByText('Сначала введите сумму')).toBeInTheDocument()
    expect(await db.transactions.count()).toBe(0)
  })

  it('доход', async () => {
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить операцию' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Доход' }))
    await press('1', '0', '0')
    fireEvent.click(await screen.findByRole('button', { name: /Зарплата/ }))
    await waitFor(() => expect(balanceText()).toBe(`10${NBSP}600,00${NBSP}₽`))
  })

  it('перевод меняет счета, но не общий баланс', async () => {
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить операцию' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Перевод' }))
    await press('2', '0', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Перевести' }))
    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    const [t] = await db.transactions.toArray()
    expect(t.type).toBe('transfer')
    expect(t.categoryId).toBeUndefined()
    expect(balanceText()).toBe(`10${NBSP}500,00${NBSP}₽`)
  })

  it('операцию можно удалить и вернуть кнопкой «Отменить»', async () => {
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить операцию' }))
    await press('5', '0')
    fireEvent.click(await screen.findByRole('button', { name: /Кафе/ }))
    await waitFor(() => expect(balanceText()).toBe(`10${NBSP}450,00${NBSP}₽`))

    // открыть операцию из списка «Последние операции» и удалить
    fireEvent.click(await screen.findByRole('button', { name: /Кафе.*50/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Удалить/ }))
    await waitFor(() => expect(balanceText()).toBe(`10${NBSP}500,00${NBSP}₽`))

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Отменить' }))
    })
    await waitFor(() => expect(balanceText()).toBe(`10${NBSP}450,00${NBSP}₽`))
  })
})

describe('каркас', () => {
  beforeEach(withAccounts)

  it('в нижнем меню пять разделов, переход открывает экран', async () => {
    renderAt('/')
    const nav = await screen.findByRole('navigation', { name: 'Основное меню' })
    for (const label of ['Главная', 'Операции', 'Аналитика', 'Цели', 'Настройки']) {
      expect(nav).toHaveTextContent(label)
    }
    fireEvent.click(within(nav).getByRole('link', { name: /Цели/ }))
    expect(await screen.findByRole('heading', { name: 'Цели' })).toBeInTheDocument()
  })

  it('тёмная тема включается и запоминается', async () => {
    renderAt('/settings')
    fireEvent.click(await screen.findByRole('radio', { name: /Тёмная/ }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('quidly-theme')).toBe('dark')
  })
})

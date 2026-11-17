import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { db } from './db/db'
import { addTransaction, finishOnboarding, setBudget } from './db/repo'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

const FOOD = 'seed-expense-1'
const CAFE = 'seed-expense-2'
const S = ' '

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

let card = ''
let cash = ''
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0)) // 10 ноября 2026
  await resetDb()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  await finishOnboarding([
    { name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 10000000 },
    { name: 'Наличные', type: 'cash', emoji: '💵', color: '#000', initialBalance: 1000000 },
  ])
  ;[card, cash] = (await db.accounts.orderBy('order').toArray()).map((a) => a.id)
  const add = (amount: number, date: string, categoryId: string, accountId = card) =>
    addTransaction({ type: 'expense', amount: amount * 100, date, accountId, categoryId })
  await add(6000, '2026-11-02', FOOD)
  await add(2000, '2026-11-05', FOOD, cash)
  await add(2000, '2026-11-10', CAFE)
  await add(5000, '2026-10-15', FOOD)
  await addTransaction({ type: 'transfer', amount: 300000, date: '2026-11-03', accountId: card, toAccountId: cash })
})
afterEach(() => vi.useRealTimers())

describe('аналитика', () => {
  it('прогноз, «можно в день», траты по категориям, сравнение с прошлым месяцем', async () => {
    await setBudget(FOOD, 2000000, '2026-11') // общий бюджет = 20 000
    renderAt('/analytics')

    const fc = await screen.findByRole('region', { name: 'Прогноз' })
    // потрачено 10 000 за 10 дней из 30 → 30 000; осталось 10 000 на 21 день → 476 ₽
    expect(fc).toHaveTextContent(`30${S}000${S}₽`)
    expect(fc).toHaveTextContent(`476${S}₽`)

    const cats = screen.getByRole('region', { name: 'Траты по категориям' })
    expect(within(cats).getByRole('button', { name: /Продукты: 8\s000\s₽/ })).toHaveTextContent('80%')
    expect(within(cats).getByRole('button', { name: /Кафе: 2\s000\s₽/ })).toHaveTextContent('20%')

    // 1–10 ноября: 10 000; 1–10 октября: 0 (трата 15 октября позже) → сравнивать не с чем
    expect(screen.getByRole('region', { name: 'Динамика по месяцам' })).toHaveTextContent('Сравнивать пока не с чем')
  })

  it('тап по категории — операции этой категории за месяц', async () => {
    renderAt('/analytics')
    const cats = await screen.findByRole('region', { name: 'Траты по категориям' })
    fireEvent.click(within(cats).getByRole('button', { name: /Продукты/ }))
    expect(await screen.findByRole('heading', { name: 'Операции' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Расходы за период')).toHaveTextContent(`8${S}000${S}₽`))
    expect(screen.getByLabelText('Категория')).toHaveValue(FOOD)
  })

  it('тап по дню календаря — операции этого дня', async () => {
    renderAt('/analytics')
    fireEvent.click(await screen.findByRole('button', { name: /^05\.11\.2026/ }))
    expect((await screen.findAllByText(/5 ноября, четверг/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Показать весь месяц' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Расходы за период')).toHaveTextContent(`2${S}000${S}₽`))
  })

  it('прошлый месяц целиком сравнивается с позапрошлым', async () => {
    renderAt('/analytics')
    fireEvent.click(await screen.findByRole('button', { name: 'Предыдущий месяц' }))
    // октябрь 5 000 против сентября 0 → не с чем
    expect(screen.getByRole('region', { name: 'Динамика по месяцам' })).toHaveTextContent('Сравнивать пока не с чем')
    fireEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }))
    await addTransaction({ type: 'expense', amount: 500000, date: '2026-10-04', accountId: card, categoryId: CAFE })
    // 1–10 ноября: 10 000; 1–10 октября: 5 000 → +100%
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Динамика по месяцам' })).toHaveTextContent(
        'За 10 дней ноября потрачено на 100% больше, чем за те же дни прошлого месяца',
      ),
    )
  })

  it('год — все траты года', async () => {
    renderAt('/analytics')
    fireEvent.click(await screen.findByRole('radio', { name: 'Год' }))
    const cats = screen.getByRole('region', { name: 'Траты по категориям' })
    expect(within(cats).getByRole('button', { name: /Продукты: 13\s000\s₽/ })).toBeInTheDocument()
  })
})

describe('фильтры операций', () => {
  it('по счёту: наличные — только операции наличных и переводы на них', async () => {
    renderAt('/operations')
    fireEvent.change(await screen.findByLabelText('Счёт'), { target: { value: cash } })
    await waitFor(() => expect(screen.getByLabelText('Расходы за период')).toHaveTextContent(`2${S}000${S}₽`))
    expect(screen.getByText('Перевод')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Сбросить фильтры/ }))
    await waitFor(() => expect(screen.getByLabelText('Расходы за период')).toHaveTextContent(`10${S}000${S}₽`))
  })
})

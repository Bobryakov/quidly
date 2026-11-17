import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { db } from './db/db'
import { addGoalMove, addTransaction, createGoal, finishOnboarding, setBudget } from './db/repo'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

const CAFE = 'seed-expense-2'
const S = ' ' // неразрывные пробелы в проверках текста сводятся к обычным

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

let accountId = ''
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0)) // 3 ноября 2026
  await resetDb()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  await finishOnboarding([{ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 5000000 }])
  accountId = (await db.accounts.toArray())[0].id
})
afterEach(() => vi.useRealTimers())

describe('цели: экран', () => {
  it('новая цель со сроком — подсказка «откладывай X ₽ в месяц»', async () => {
    renderAt('/goals')
    expect(await screen.findByText('Копилок пока нет')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Новая цель' }))
    fireEvent.change(await screen.findByLabelText('Название цели'), { target: { value: 'Отпуск' } })
    fireEvent.change(screen.getByLabelText('Сколько нужно накопить'), { target: { value: '90 000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Есть срок' }))
    fireEvent.change(screen.getByLabelText('Срок цели'), { target: { value: '2027-01-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    const card = await screen.findByRole('button', { name: 'Цель Отпуск' })
    // 90 000 за 3 месяца (ноябрь, декабрь, январь)
    expect(card).toHaveTextContent(`откладывай 30${S}000${S}₽ в месяц`)
  })

  it('пополнение до цели — конфетти и «Достигнуты»; на главной — «в копилках · свободно»', async () => {
    const id = await createGoal({ name: 'Телефон', emoji: '📱', color: '#000', target: 1000000 })
    await addGoalMove(id, 700000, '2026-11-01')
    renderAt('/goals')
    fireEvent.click(await screen.findByRole('button', { name: 'Цель Телефон' }))
    fireEvent.click(await screen.findByRole('button', { name: /Пополнить/ }))
    fireEvent.change(screen.getByLabelText('Сумма пополнения'), { target: { value: '3000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отложить' }))

    expect(await screen.findByTestId('confetti')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Цель «Телефон» достигнута')
    expect(await screen.findByText('Достигнуты 🎉')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Основное меню' })
    fireEvent.click(within(nav).getByRole('link', { name: /Главная/ }))
    expect(await screen.findByRole('link', { name: 'Отложено в копилки' })).toHaveTextContent(
      `в копилках 10${S}000${S}₽ · свободно 40${S}000${S}₽`,
    )
    expect(await db.transactions.count()).toBe(0) // копилки не создают операций
  })

  it('снять больше, чем лежит, нельзя', async () => {
    const id = await createGoal({ name: 'Подушка', emoji: '🛟', color: '#000', target: 1000000 })
    await addGoalMove(id, 100000, '2026-11-01')
    renderAt('/goals')
    fireEvent.click(await screen.findByRole('button', { name: 'Цель Подушка' }))
    fireEvent.click(await screen.findByRole('button', { name: /Снять/ }))
    fireEvent.change(screen.getByLabelText('Сумма снятия'), { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Снять' }))
    expect(await screen.findByText('Столько в копилке нет')).toBeInTheDocument()
  })
})

describe('«🐷 В копилку» в итогах месяца', () => {
  it('остаток кафе за октябрь уходит в копилку', async () => {
    const goalId = await createGoal({ name: 'Отпуск', emoji: '🏖️', color: '#000', target: 10000000 })
    await setBudget(CAFE, 300000, '2026-10')
    await addTransaction({ type: 'expense', amount: 250000, date: '2026-10-05', accountId, categoryId: CAFE })

    renderAt('/')
    const card = await screen.findByRole('region', { name: 'Итоги месяца' })
    const choice = within(card).getByRole('radiogroup', { name: /Кафе/ })
    fireEvent.click(within(choice).getByRole('radio', { name: /В копилку/ }))
    expect(card).toHaveTextContent(`500${S}₽ — в копилку «Отпуск»`)
    fireEvent.click(within(card).getByRole('button', { name: /Применить/ }))

    await waitFor(async () => expect(await db.goalMoves.count()).toBe(1))
    expect((await db.goalMoves.toArray())[0]).toMatchObject({ goalId, amount: 50000, source: 'closing' })
    expect(await screen.findByRole('status')).toHaveTextContent(`в копилки 500${S}₽`)
  })
})

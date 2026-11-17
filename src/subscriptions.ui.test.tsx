import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { db } from './db/db'
import { createSubscription, finishOnboarding } from './db/repo'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

const SUBS_CAT = 'seed-expense-6'

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
  vi.setSystemTime(new Date(2026, 10, 17, 12, 0)) // «сегодня» — 17 ноября 2026
  await resetDb()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  await finishOnboarding([{ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 1000000 }])
  accountId = (await db.accounts.toArray())[0].id
})
afterEach(() => vi.useRealTimers())

describe('подписки: экран', () => {
  it('добавить подписку — она в списке, сумма в месяц посчитана', async () => {
    renderAt('/subscriptions')
    expect(await screen.findByText('Подписок пока нет')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить подписку' }))
    fireEvent.change(await screen.findByLabelText('Название подписки'), { target: { value: 'Кинопоиск' } })
    fireEvent.change(screen.getByLabelText('Сумма подписки'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Год' }))
    fireEvent.change(screen.getByLabelText('Дата следующего списания'), { target: { value: '2026-11-30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(async () => expect(await db.subscriptions.count()).toBe(1))
    expect(await db.subscriptions.toArray()).toMatchObject([
      { name: 'Кинопоиск', amount: 120000, period: 'year', nextDate: '2026-11-30', categoryId: SUBS_CAT, accountId },
    ])
    expect(await screen.findByLabelText('Подписки в месяц')).toHaveTextContent('100 ₽')
  })
})

describe('подписки: плашка на главной', () => {
  it('«Скоро спишется» → «Проведено» записывает трату; «Отменить» возвращает', async () => {
    await createSubscription({ name: 'Музыка', amount: 29900, period: 'month', nextDate: '2026-11-19', accountId, categoryId: SUBS_CAT })
    renderAt('/')
    const row = await screen.findByRole('group', { name: 'Подписка Музыка' })
    expect(row).toHaveTextContent('Скоро спишется · послезавтра')
    fireEvent.click(within(row).getByRole('button', { name: /Проведено/ }))

    await waitFor(async () => expect(await db.transactions.count()).toBe(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({ amount: 29900, date: '2026-11-17', comment: 'Музыка' })
    expect((await db.subscriptions.toArray())[0].nextDate).toBe('2026-12-19')
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Подписка Музыка' })).not.toBeInTheDocument())

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Отменить' }))
    })
    await waitFor(async () => expect(await db.transactions.count()).toBe(0))
    expect((await db.subscriptions.toArray())[0].nextDate).toBe('2026-11-19')
  })

  it('пропущенные списания: спрашивает про каждое по очереди', async () => {
    await createSubscription({ name: 'Связь', amount: 50000, period: 'month', nextDate: '2026-09-10', accountId, categoryId: SUBS_CAT })
    renderAt('/')
    let row = await screen.findByRole('group', { name: 'Подписка Связь' })
    expect(row).toHaveTextContent('Списалось 10.09.2026?')
    expect(row).toHaveTextContent('и ещё 2 пропущенных списания')

    // 10.09 — не было (пропустить), 10.10 — было (проведено)
    fireEvent.click(within(row).getByRole('button', { name: 'Пропустить' }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Подписка Связь' })).toHaveTextContent('Списалось 10.10.2026?'))
    row = screen.getByRole('group', { name: 'Подписка Связь' })
    fireEvent.click(within(row).getByRole('button', { name: /Проведено/ }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'Подписка Связь' })).toHaveTextContent('Списалось 10.11.2026?'))

    const txs = await db.transactions.toArray()
    expect(txs.map((t) => t.date)).toEqual(['2026-10-10'])
  })

  it('далёкое списание — только строка-сводка без плашки', async () => {
    await createSubscription({ name: 'Облако', amount: 9900, period: 'month', nextDate: '2026-11-28', accountId, categoryId: SUBS_CAT })
    renderAt('/')
    expect(await screen.findByRole('link', { name: /Подписки: 99\s₽ в месяц\s*· ближайшая 28 ноября/ })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Подписка Облако' })).not.toBeInTheDocument()
  })
})

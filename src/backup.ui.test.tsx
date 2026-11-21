import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { makeBackupText } from './db/backupRepo'
import { db, SCHEMA_VERSION } from './db/db'
import { addTransaction, finishOnboarding, getMeta, META } from './db/repo'
import { buildBackup } from './lib/backup'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

// Вместо настоящего скачивания — запоминаем, какой файл «скачали»
const saved: { data: unknown; name: string; mime: string }[] = []
vi.mock('./lib/fileSave', () => ({
  downloadFile: (data: unknown, name: string, mime: string) => saved.push({ data, name, mime }),
  canShareFile: () => false,
  shareFile: async () => true,
}))

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

const DAY = 86_400_000
let card = ''

beforeAll(async () => {
  await import('./pages/settings/ExportPage')
})

beforeEach(async () => {
  saved.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 21, 12, 0))
  await resetDb()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  await finishOnboarding([{ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 1000000 }])
  card = (await db.accounts.toCollection().first())!.id
  await addTransaction({ type: 'expense', amount: 50000, date: '2026-11-20', accountId: card, categoryId: 'seed-expense-1', comment: 'Хлеб' })
  await addTransaction({ type: 'expense', amount: 12000, date: '2026-11-03', accountId: card, categoryId: 'seed-expense-2' })
  await addTransaction({ type: 'income', amount: 9000000, date: '2026-10-05', accountId: card, categoryId: 'seed-income-1' })
})
afterEach(() => vi.useRealTimers())

/** Копия «другого телефона»: один счёт «Старая карта» и одна операция. */
async function otherBackup(password?: string) {
  const text = await buildBackup(
    {
      accounts: [{ id: 'old', name: 'Старая карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 777700, archived: false, order: 0, createdAt: 1 }],
      categories: [{ id: 'seed-expense-1', name: 'Продукты', kind: 'expense', emoji: '🛒', color: '#000', order: 0, createdAt: 1 }],
      transactions: [{ id: 'x', type: 'expense', amount: 700, date: '2026-11-01', accountId: 'old', categoryId: 'seed-expense-1', createdAt: 1, updatedAt: 1 }],
      meta: [],
      budgets: [],
      closings: [],
      subscriptions: [],
      goals: [],
      goalMoves: [],
      importRules: [],
    },
    { schemaVersion: SCHEMA_VERSION, password, now: new Date(2026, 10, 1, 9, 30), iterations: 1000 },
  )
  return new File([text], 'quidly-kopiya.json', { type: 'application/json' })
}

describe('резервная копия', () => {
  it('в настройках — PIN, копия и экспорт', async () => {
    renderAt('/settings')
    expect(await screen.findByRole('link', { name: /PIN и блокировка/ })).toHaveAttribute('href', '/settings/security')
    expect(screen.getByRole('link', { name: /Резервная копия/ })).toHaveAttribute('href', '/settings/backup')
    expect(screen.getByRole('link', { name: /Экспорт в Excel/ })).toHaveAttribute('href', '/settings/export')
    expect(screen.queryByText('Скоро')).not.toBeInTheDocument()
  })

  it('сохранение копии: файл с данными, дата последней копии', async () => {
    renderAt('/settings/backup')
    expect(await screen.findByLabelText('Последняя копия')).toHaveTextContent('Копию на этом телефоне ещё не сохраняли.')
    fireEvent.click(screen.getByRole('button', { name: '⤓ Сохранить файл' }))
    expect(await screen.findByText('Копия сохранена в «Загрузки» ✅')).toBeInTheDocument()
    expect(saved).toHaveLength(1)
    expect(saved[0].name).toBe('quidly-kopiya_2026-11-21.json')
    const file = JSON.parse(saved[0].data as string)
    expect(file.schemaVersion).toBe(SCHEMA_VERSION)
    expect(file.data.transactions).toHaveLength(3)
    await waitFor(() => expect(screen.getByLabelText('Последняя копия')).toHaveTextContent('Последняя копия: 21.11.2026'))
    expect(await getMeta(META.lastBackupAt)).toBe(new Date(2026, 10, 21, 12, 0).getTime())
  })

  it('пароль: слишком короткий и несовпадающий — ошибка', async () => {
    renderAt('/settings/backup')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Защитить паролем/ }))
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: '⤓ Сохранить файл' }))
    expect(await screen.findByText('Пароль — не короче 6 символов')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('Пароль ещё раз'), { target: { value: '123457' } })
    fireEvent.click(screen.getByRole('button', { name: '⤓ Сохранить файл' }))
    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument()
    expect(saved).toHaveLength(0)
  })

  it('восстановление: что в копии → предупреждение → данные заменены', async () => {
    renderAt('/settings/backup')
    fireEvent.change(await screen.findByLabelText('Файл резервной копии'), { target: { files: [await otherBackup()] } })
    expect(await screen.findByText('Копия от 01.11.2026 в 09:30')).toBeInTheDocument()
    expect(screen.getByLabelText('Что в копии')).toHaveTextContent('1 счёт, 1 операция')
    expect(screen.getByText(/Все текущие данные на этом телефоне/)).toHaveTextContent('Все текущие данные на этом телефоне будут заменены')
    fireEvent.click(screen.getByRole('button', { name: 'Заменить данные' }))
    expect(await screen.findByText('Данные восстановлены ✅')).toBeInTheDocument()
    expect(await screen.findByLabelText('Общий баланс')).toHaveTextContent('7 770,00')
    expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['Старая карта'])
  })

  it('копия с паролем: спрашивает пароль, неверный — ошибка', async () => {
    renderAt('/settings/backup')
    fireEvent.change(await screen.findByLabelText('Файл резервной копии'), { target: { files: [await otherBackup('секрет!')] } })
    const pass = await screen.findByLabelText('Пароль копии')
    fireEvent.change(pass, { target: { value: 'не тот' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть копию' }))
    expect(await screen.findByText('Неверный пароль.')).toBeInTheDocument()
    fireEvent.change(pass, { target: { value: 'секрет!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть копию' }))
    expect(await screen.findByText('Копия от 01.11.2026 в 09:30')).toBeInTheDocument()
  })

  it('чужой файл — понятная ошибка, данные не тронуты', async () => {
    renderAt('/settings/backup')
    fireEvent.change(await screen.findByLabelText('Файл резервной копии'), {
      target: { files: [new File(['Дата;Сумма'], 'vypiska.csv', { type: 'text/csv' })] },
    })
    expect(await screen.findByText('Это не файл резервной копии Quidly.')).toBeInTheDocument()
    expect(await db.transactions.count()).toBe(3)
  })

  it('на новом телефоне: восстановить можно прямо со знакомства', async () => {
    await resetDb()
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: /Есть резервная копия\? Восстановить/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Восстановить из копии' })
    fireEvent.change(within(sheet).getByLabelText('Файл резервной копии'), { target: { files: [await otherBackup()] } })
    expect(within(sheet).queryByText(/Все текущие данные/)).not.toBeInTheDocument() // заменять нечего
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Восстановить' }))
    expect(await screen.findByLabelText('Общий баланс')).toHaveTextContent('7 770,00')
  })

  it('напоминание на главной раз в неделю; «Завтра» убирает его', async () => {
    await db.accounts.update(card, { createdAt: Date.now() - 8 * DAY })
    renderAt('/')
    const r = await screen.findByRole('region', { name: 'Напоминание о резервной копии' })
    expect(r).toHaveTextContent('Вы ещё ни разу её не сохраняли')
    expect(within(r).getByRole('link', { name: 'Сохранить' })).toHaveAttribute('href', '/settings/backup')
    fireEvent.click(within(r).getByRole('button', { name: 'Завтра' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Напоминание о резервной копии' })).not.toBeInTheDocument())
  })

  it('свежая копия — напоминания нет', async () => {
    await db.accounts.update(card, { createdAt: Date.now() - 30 * DAY })
    await makeBackupText() // просто проверим, что сборка не ломается
    await db.meta.put({ key: META.lastBackupAt, value: Date.now() - 2 * DAY })
    renderAt('/')
    expect(await screen.findByLabelText('Общий баланс')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Напоминание о резервной копии' })).not.toBeInTheDocument()
  })
})

describe('экспорт', () => {
  it('этот месяц в Excel, всё время в CSV', async () => {
    renderAt('/settings/export')
    expect(await screen.findByText('Будет выгружено: 2 операции')).toBeInTheDocument()
    expect(screen.getByText('01.11.2026 — 30.11.2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '⤓ Скачать файл' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe('quidly-operacii_2026-11-01_2026-11-30.xlsx')
    expect(saved[0].data).toBeInstanceOf(Uint8Array)

    fireEvent.click(screen.getByRole('radio', { name: 'Всё время' }))
    fireEvent.click(screen.getByRole('radio', { name: 'CSV' }))
    expect(screen.getByText('Будет выгружено: 3 операции')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '⤓ Скачать файл' }))
    await waitFor(() => expect(saved).toHaveLength(2))
    expect(saved[1].name).toBe('quidly-operacii_2026-10-05_2026-11-20.csv')
    expect(saved[1].data as string).toContain('20.11.2026;Расход;-500,00;Карта;;Продукты;Хлеб')
  })

  it('свои даты: «с» позже «по» — кнопка недоступна', async () => {
    renderAt('/settings/export')
    fireEvent.click(await screen.findByRole('radio', { name: 'Свои даты' }))
    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-11-25' } })
    expect(screen.getByText('Дата «с» позже даты «по»')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '⤓ Скачать файл' })).toBeDisabled()
  })
})

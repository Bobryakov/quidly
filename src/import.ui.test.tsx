import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { db } from './db/db'
import { addTransaction, finishOnboarding } from './db/repo'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

const CSV = [
  'Дата операции;Сумма операции;Категория;Описание',
  '10.11.2026 12:00:00;-500,00;Супермаркеты;MAGAZIN KOLOSOK 1 MOSCOW RUS',
  '10.11.2026 13:00:00;-120,00;Прочие расходы;KOPIRKA 7 MOSCOW RUS',
  '11.11.2026 09:00:00;-1 000,00;Перевод СБП;Перевод в T-Bank',
  '12.11.2026 10:00:00;+30 000,00;Зарплата;ООО Работа',
  '12.11.2026 18:00:00;-350,00;Рестораны и кафе;CAFE ROMASHKA',
].join('\n')

let sber = ''
// Страница грузится отдельным куском — загружаем её заранее, чтобы тест не ждал
beforeAll(async () => {
  await import('./pages/ImportPage')
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 17, 12, 0))
  await resetDb()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  await finishOnboarding([
    { name: 'Сбер', type: 'card', emoji: '💳', color: '#000', initialBalance: 1000000 },
    { name: 'Т-Банк', type: 'card', emoji: '💳', color: '#000', initialBalance: 0 },
  ])
  sber = (await db.accounts.orderBy('order').first())!.id
  // «Кафе» уже внесено вручную — в выписке оно должно оказаться «похоже на вашу запись»
  await addTransaction({ type: 'expense', amount: 35000, date: '2026-11-12', accountId: sber, categoryId: 'seed-expense-2' })
})
afterEach(() => vi.useRealTimers())

describe('импорт CSV', () => {
  it('файл → колонки → предпросмотр → правка категории → импорт', async () => {
    renderAt('/import')
    const input = await screen.findByLabelText('Файл выписки')
    fireEvent.change(input, { target: { files: [new File([CSV], 'vypiska.csv', { type: 'text/csv' })] } })

    // колонки угаданы, пример строк показан
    expect(await screen.findByText(/Нашлось 5 операций/)).toBeInTheDocument()
    expect(screen.getByLabelText('Дата')).toHaveValue('0')
    fireEvent.click(screen.getByRole('button', { name: 'Дальше' }))

    // предпросмотр
    const summary = await screen.findByLabelText('Сводка импорта')
    expect(summary).toHaveTextContent('к импорту: 4')
    expect(summary).toHaveTextContent('переводов на свои счета: 1')
    expect(summary).toHaveTextContent('похоже на ваши записи: 1')
    const cafe = screen.getByRole('listitem', { name: 'Строка: CAFE ROMASHKA' })
    expect(cafe).toHaveTextContent('похоже на вашу запись')
    expect(within(cafe).getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('listitem', { name: 'Строка: Перевод в T-Bank' })).toHaveTextContent('⇄ на «Т-Банк»')

    // копирку — в «Образование» (запомнится правилом)
    const copy = screen.getByRole('listitem', { name: 'Строка: KOPIRKA 7 MOSCOW RUS' })
    fireEvent.click(within(copy).getByRole('button', { name: 'Категория: Прочее' }))
    fireEvent.click(await screen.findByRole('button', { name: /Образование/ }))
    await waitFor(() => expect(within(copy).getByRole('button', { name: 'Категория: Образование' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Импортировать: 4' }))
    expect(await screen.findByRole('heading', { name: 'Операции' })).toBeInTheDocument()

    const txs = await db.transactions.where('importKey').above('').toArray()
    expect(txs).toHaveLength(4)
    expect(txs.find((t) => t.comment === 'KOPIRKA 7 MOSCOW RUS')?.categoryId).toBe('seed-expense-11')
    expect(txs.find((t) => t.type === 'transfer')).toMatchObject({ amount: 100000, accountId: sber })
    expect(await db.importRules.toArray()).toMatchObject([{ pattern: 'KOPIRKA', categoryId: 'seed-expense-11' }])
  })

  it('непонятный файл — понятная ошибка', async () => {
    renderAt('/import')
    fireEvent.change(await screen.findByLabelText('Файл выписки'), { target: { files: [new File(['x'], 'photo.jpg')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Подходят файлы PDF (Сбер), CSV и Excel')
  })
})

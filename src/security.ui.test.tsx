import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { LockGate } from './components/LockGate'
import { db } from './db/db'
import { addTransaction, finishOnboarding, getMeta, META } from './db/repo'
import { setPin } from './db/securityRepo'
import { appControl } from './lib/reload'
import { lock, onVisibility, resetLockForTests } from './lib/security/lockState'
import { hideToast } from './lib/store'
import { resetThemeForTests } from './lib/theme'
import { resetDb } from './test/resetDb'

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LockGate>
        <AppRoutes />
      </LockGate>
    </MemoryRouter>,
  )
}

/** Набрать PIN на клавиатуре внутри `scope`. */
function type(scope: HTMLElement, pin: string) {
  const pad = within(scope).getByRole('group', { name: 'Клавиатура PIN-кода' })
  for (const d of pin) fireEvent.click(within(pad).getByRole('button', { name: d }))
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 21, 12, 0))
  await resetDb()
  resetLockForTests()
  hideToast()
  localStorage.clear()
  resetThemeForTests()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  await finishOnboarding([{ name: 'Карта', type: 'card', emoji: '💳', color: '#000', initialBalance: 1000000 }])
  const card = (await db.accounts.toCollection().first())!.id
  await addTransaction({ type: 'expense', amount: 50000, date: '2026-11-21', accountId: card, categoryId: 'seed-expense-1' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('PIN-код', () => {
  it('без PIN приложение открывается сразу; включение PIN: придумать → повторить', async () => {
    renderAt('/settings/security')
    fireEvent.click(await screen.findByRole('button', { name: 'Включить PIN' }))
    const sheet = await screen.findByRole('dialog', { name: 'PIN-код' })
    expect(within(sheet).getByText(/4 цифры\. Не используйте год рождения/)).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Введено цифр: 0').children).toHaveLength(4) // 4 кружка
    expect(within(sheet).queryByRole('button', { name: 'Далее' })).not.toBeInTheDocument()
    type(sheet, '258')
    expect(within(sheet).getByRole('heading', { name: 'Придумайте PIN' })).toBeInTheDocument()
    type(sheet, '0') // четвёртая цифра — сразу «повторите»
    expect(within(sheet).getByRole('heading', { name: 'Повторите PIN' })).toBeInTheDocument()
    type(sheet, '2581') // не совпал
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('PIN не совпал'))
    type(sheet, '2580')
    expect(within(sheet).getByRole('heading', { name: 'Повторите PIN' })).toBeInTheDocument()
    type(sheet, '2580')
    expect(await screen.findByText('PIN включён 🔒')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '✅ PIN-код включён' })).toBeInTheDocument()
    expect(lock.get()).toBe('unlocked')
    const rec = await getMeta<{ hash: string; length: number }>(META.pin)
    expect(rec?.length).toBe(4)
    expect(JSON.stringify(rec)).not.toContain('2580')
  })

  it('с PIN приложение открывается закрытым; неверный PIN — ошибка, верный — открывает', async () => {
    await setPin('2580', 1000)
    renderAt('/')
    const lockScreen = await screen.findByRole('dialog', { name: 'Quidly заблокирован' })
    expect(screen.queryByLabelText('Общий баланс')).not.toBeInTheDocument() // данные даже не рисуются
    type(lockScreen, '1111')
    await waitFor(() => expect(within(lockScreen).getByRole('alert')).toHaveTextContent('Неверный PIN. До паузы осталось попыток: 4'))
    type(lockScreen, '2580')
    expect(await screen.findByLabelText('Общий баланс')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Quidly заблокирован' })).not.toBeInTheDocument()
  })

  it('пять ошибок подряд — пауза с обратным отсчётом', async () => {
    await setPin('2580', 1000)
    renderAt('/')
    const lockScreen = await screen.findByRole('dialog', { name: 'Quidly заблокирован' })
    for (let i = 1; i <= 4; i++) {
      type(lockScreen, '0000')
      await waitFor(() => expect(within(lockScreen).getByRole('alert')).toHaveTextContent(i === 4 ? 'осталась 1 попытка' : `осталось попыток: ${5 - i}`))
    }
    type(lockScreen, '0000')
    await waitFor(() => expect(within(lockScreen).getByRole('alert')).toHaveTextContent('Слишком много ошибок. Попробуйте через 0:30'))
    expect(within(lockScreen).getByRole('button', { name: '2' })).toBeDisabled()
  })

  it('автоблокировка: через минуту в фоне — замок, раньше — нет; экран под замком сохраняется', async () => {
    await setPin('2580', 1000)
    renderAt('/settings')
    type(await screen.findByRole('dialog', { name: 'Quidly заблокирован' }), '2580')
    expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeInTheDocument()

    act(() => onVisibility(true, 0))
    act(() => onVisibility(false, 30_000))
    expect(screen.queryByRole('dialog', { name: 'Quidly заблокирован' })).not.toBeInTheDocument()

    act(() => onVisibility(true, 100_000))
    act(() => onVisibility(false, 160_000))
    const ls = await screen.findByRole('dialog', { name: 'Quidly заблокирован' })
    expect(screen.getByRole('heading', { name: 'Настройки' })).toBeInTheDocument() // экран остался под замком
    type(ls, '2580')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quidly заблокирован' })).not.toBeInTheDocument())
  })

  it('«Сразу» — закрывается уже при уходе в фон', async () => {
    await setPin('2580', 1000)
    renderAt('/settings/security')
    type(await screen.findByRole('dialog', { name: 'Quidly заблокирован' }), '2580')
    fireEvent.click(await screen.findByRole('radio', { name: 'Сразу' }))
    await waitFor(async () => expect(await getMeta(META.lockTimeout)).toBe(0))
    act(() => onVisibility(true))
    expect(await screen.findByRole('dialog', { name: 'Quidly заблокирован' })).toBeInTheDocument()
  })

  it('смена и выключение PIN требуют текущий PIN', async () => {
    await setPin('2580', 1000)
    renderAt('/settings/security')
    type(await screen.findByRole('dialog', { name: 'Quidly заблокирован' }), '2580')

    fireEvent.click(await screen.findByRole('button', { name: '🔢 Сменить PIN' }))
    let sheet = await screen.findByRole('dialog', { name: 'PIN-код' })
    type(sheet, '9999')
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('Неверный PIN'))
    type(sheet, '2580')
    await within(sheet).findByRole('heading', { name: 'Придумайте PIN' })
    expect(within(sheet).getByLabelText('Введено цифр: 0')).toBeInTheDocument() // старые цифры стёрты
    type(sheet, '1357')
    type(sheet, '1357')
    expect(await screen.findByText('PIN изменён')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Выключить PIN' }))
    sheet = await screen.findByRole('dialog', { name: 'PIN-код' })
    type(sheet, '1357')
    expect(await screen.findByText('PIN выключен')).toBeInTheDocument()
    expect(await getMeta(META.pin)).toBeUndefined()
    expect(lock.get()).toBe('off')
  })

  it('PIN из 6 цифр, заданный раньше, продолжает работать; сменить можно только на 4 цифры', async () => {
    // как было на этапе 8: PIN «135790»
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('135790'), 'PBKDF2', false, ['deriveBits'])
    const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, key, 256))
    const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
    await db.meta.put({ key: META.pin, value: { salt: b64(salt), hash: b64(hash), iterations: 1000, length: 6 } })

    renderAt('/settings/security')
    const ls = await screen.findByRole('dialog', { name: 'Quidly заблокирован' })
    expect(within(ls).getByLabelText('Введено цифр: 0').children).toHaveLength(6)
    type(ls, '135790')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quidly заблокирован' })).not.toBeInTheDocument())

    fireEvent.click(await screen.findByRole('button', { name: '🔢 Сменить PIN' }))
    const sheet = await screen.findByRole('dialog', { name: 'PIN-код' })
    expect(within(sheet).getByLabelText('Введено цифр: 0').children).toHaveLength(6) // текущий — 6 цифр
    type(sheet, '135790')
    await within(sheet).findByRole('heading', { name: 'Придумайте PIN' })
    expect(within(sheet).getByLabelText('Введено цифр: 0').children).toHaveLength(4) // новый — 4
    type(sheet, '2468')
    type(sheet, '2468')
    expect(await screen.findByText('PIN изменён')).toBeInTheDocument()
    expect((await getMeta<{ length: number }>(META.pin))?.length).toBe(4)
  })

  it('«Забыли PIN?» — только с удалением всех данных и словом УДАЛИТЬ', async () => {
    const reload = vi.spyOn(appControl, 'reload').mockImplementation(() => {})
    await setPin('2580', 1000)
    renderAt('/')
    const ls = await screen.findByRole('dialog', { name: 'Quidly заблокирован' })
    fireEvent.click(within(ls).getByRole('button', { name: 'Забыли PIN?' }))
    const sheet = await screen.findByRole('dialog', { name: 'Забыли PIN' })
    expect(within(sheet).getByText(/Резервную копию на этом телефоне ещё не сохраняли/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Сбросить PIN и удалить данные' }))
    const del = within(sheet).getByRole('button', { name: 'Удалить все данные' })
    expect(del).toBeDisabled()
    fireEvent.change(within(sheet).getByLabelText('Слово для подтверждения'), { target: { value: 'удалить' } })
    expect(del).toBeEnabled()
    fireEvent.click(del)
    await waitFor(() => expect(reload).toHaveBeenCalled())
    await db.open()
    expect(await db.accounts.count()).toBe(0)
    expect(await db.transactions.count()).toBe(0)
    expect(await getMeta(META.pin)).toBeUndefined()
  })
})

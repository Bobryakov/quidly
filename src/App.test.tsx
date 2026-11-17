import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { resetThemeForTests } from './lib/theme'

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  resetThemeForTests()
  document.documentElement.classList.remove('dark')
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  )
})

describe('каркас приложения', () => {
  it('показывает главную с нулевым балансом и подсказкой', () => {
    renderAt('/')
    expect(screen.getByText('Общий баланс')).toBeInTheDocument()
    // сумма с неразрывным пробелом перед ₽
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '0,00\u00A0₽'),
    ).toBeInTheDocument()
    expect(screen.getByText('Нажми ➕, чтобы добавить первую трату')).toBeInTheDocument()
  })

  it('в нижнем меню пять разделов', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Основное меню' })
    for (const label of ['Главная', 'Операции', 'Аналитика', 'Цели', 'Настройки']) {
      expect(nav).toHaveTextContent(label)
    }
  })

  it('переход по меню открывает нужный экран', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('link', { name: /Цели/ }))
    expect(screen.getByRole('heading', { name: 'Цели' })).toBeInTheDocument()
  })

  it('кнопка «+» открывает панель быстрого ввода', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Добавить операцию' }))
    expect(screen.getByRole('dialog', { name: 'Быстрый ввод' })).toBeInTheDocument()
  })

  it('тёмная тема включается и запоминается', () => {
    renderAt('/settings')
    fireEvent.click(screen.getByRole('radio', { name: /Тёмная/ }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('quidly-theme')).toBe('dark')
  })
})

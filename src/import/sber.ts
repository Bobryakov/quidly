// Выписка Сбера «Выписка по платёжному счёту» (PDF из СберБанк Онлайн).
//
// Устройство (по реальной выписке, ноябрь 2026):
//   строка 1: ДАТА ОПЕРАЦИИ | ВРЕМЯ | КАТЕГОРИЯ … | СУММА (поступление со знаком «+») | ОСТАТОК
//   строка 2: дата обработки | код авторизации | описание …
//   дальше:   продолжение описания (и «В сумму операции включена комиссия 200,00 руб.»)
// Колонки различаются по координате x: дата ≈ 45, время/код ≈ 102, текст ≈ 152, суммы правее ≈ 400.

import { parseBankAmount, parseBankDate } from './normalize'
import type { ParsedRow, ParsedStatement, TextLine } from './types'

const DATE = /^\d{2}\.\d{2}\.\d{4}$/
const TIME = /^\d{2}:\d{2}$/
const AUTH = /^\d{4,8}$/
const MONEY = /^\+?\d{1,3}(?:[\s ]\d{3})*,\d{2}$/
/** Всё, что левее, — дата/время/код; правее — текст */
const TEXT_X = 140
/** Всё, что правее, — суммы */
const AMOUNT_X = 380

/** Служебный текст страниц, который не относится к операциям */
const NOISE = [
  /Продолжение на следующей странице/i,
  /^Выписка по платёжному счёту/i,
  /^Страница \d+ из \d+/i,
  /ДАТА ОПЕРАЦИИ/i,
  /^Дата обработки/i,
  /^и код авторизации/i,
  /^операции\d?$/i,
  /Описание операции/i,
  /ОСТАТОК СРЕДСТВ/i,
]

const text = (l: TextLine) => l.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim()

export function isSberStatement(lines: TextLine[]): boolean {
  const head = lines.slice(0, 40).map(text).join(' ')
  return /sberbank\.ru|СберБанк/i.test(head) && /Выписка по платёжному сч[её]ту/i.test(head)
}

function isOperationLine(l: TextLine): boolean {
  const [a, b] = l.items
  return Boolean(a && b && a.x < TEXT_X - 50 && DATE.test(a.s.trim()) && TIME.test(b.s.trim()) && amountItem(l))
}

/** Сумма операции — предпоследнее «денежное» число справа (последнее — остаток). */
function amountItem(l: TextLine): string | undefined {
  const money = l.items.filter((i) => i.x >= AMOUNT_X && MONEY.test(i.s.trim()))
  return money.length >= 2 ? money[money.length - 2].s.trim() : undefined
}

function isNoise(l: TextLine) {
  const t = text(l)
  return NOISE.some((r) => r.test(t))
}

export function parseSber(lines: TextLine[]): ParsedStatement {
  const rows: ParsedRow[] = []

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!isOperationLine(l)) continue

    const date = parseBankDate(l.items[0].s)!
    const time = l.items[1].s.trim()
    const bankCategory = l.items
      .filter((it) => it.x >= TEXT_X && it.x < AMOUNT_X)
      .map((it) => it.s)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const amountText = amountItem(l)!
    const amount = parseBankAmount(amountText)!

    // Описание: следующие строки той же страницы, пока не началась новая операция
    let authCode: string | undefined
    const parts: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const n = lines[j]
      if (n.page !== l.page || isOperationLine(n) || isNoise(n)) break
      const first = n.items[0]
      if (first.x < TEXT_X) {
        // строка 2: дата обработки + код авторизации + начало описания
        if (j === i + 1 && DATE.test(first.s.trim())) {
          const code = n.items[1]
          if (code && code.x < TEXT_X && AUTH.test(code.s.trim())) authCode = code.s.trim()
          parts.push(...n.items.filter((it) => it.x >= TEXT_X && it.x < AMOUNT_X).map((it) => it.s))
          continue
        }
        break // начался другой блок (подвал, подписи)
      }
      parts.push(...n.items.filter((it) => it.x < AMOUNT_X).map((it) => it.s))
    }

    let description = parts.join(' ').replace(/\s+/g, ' ').trim()
    let fee: number | undefined
    const feeMatch = description.match(/В сумму операции включена комиссия\s+([\d\s ]+,\d{2})\s*руб\.?/i)
    if (feeMatch) {
      fee = parseBankAmount(feeMatch[1]) ?? undefined
      description = description.replace(feeMatch[0], '')
    }
    description = description
      .replace(/\.?\s*Операция по (карте|сч[её]ту)\s*\*{2,}\d{4}\.?/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.$/, '')

    rows.push({
      date,
      time,
      amount,
      direction: amountText.startsWith('+') ? 'in' : 'out',
      description: description || bankCategory,
      bankCategory,
      ...(authCode ? { authCode } : {}),
      ...(fee ? { fee } : {}),
    })
  }

  // Шапка (всё до первой операции): период, итоги, последние цифры карты и счёта
  const firstOp = lines.findIndex(isOperationLine)
  const all = lines.slice(0, firstOp < 0 ? 60 : firstOp).map(text)
  const joined = all.join('\n')
  const period = joined.match(/За период (\d{2}\.\d{2}\.\d{4})\s*[—–-]\s*(\d{2}\.\d{2}\.\d{4})/)
  const pick = (label: string) => {
    const line = all.find((t) => new RegExp(`^${label}\\b`).test(t) || t.includes(` ${label} `) || t.startsWith(label))
    const m = line?.match(/([\d\s ]+,\d{2})\s*$/)
    return m ? parseBankAmount(m[1]) : null
  }
  const incoming = pick('Пополнение')
  const outgoing = pick('Списание')
  const last4 = [...new Set([...joined.matchAll(/(?:••|\*{2,})\s?(\d{4})\b/g)].map((m) => m[1]))]
  const account = joined.match(/Номер сч[её]та\s+([\d\s]{20,})/)
  if (account) last4.push(account[1].replace(/\s/g, '').slice(-4))

  // «Остаток на 17.10.2026 11 093,84» и «Остаток на 17.11.2026 18 494,88» — берём более поздний
  const balances = [...joined.matchAll(/Остаток на (\d{2}\.\d{2}\.\d{4})\s+(-?[\d\s\u00A0]+,\d{2})/g)]
    .map((m) => ({ date: parseBankDate(m[1])!, amount: (m[2].trim().startsWith('-') ? -1 : 1) * parseBankAmount(m[2].replace('-', ''))! }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const closing = balances.length >= 2 ? balances[balances.length - 1] : undefined

  return {
    bank: 'sber',
    bankName: 'Сбер',
    rows,
    ...(period ? { period: { from: parseBankDate(period[1])!, to: parseBankDate(period[2])! } } : {}),
    ...(last4.length ? { last4: [...new Set(last4)] } : {}),
    ...(incoming !== null && outgoing !== null ? { totals: { incoming, outgoing } } : {}),
    ...(closing ? { closing } : {}),
  }
}

/** Сверка: сумма прочитанных операций совпадает с итогами в шапке выписки. */
export function checkTotals(st: ParsedStatement): { ok: boolean; incoming: number; outgoing: number } | null {
  if (!st.totals) return null
  const incoming = st.rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0)
  const outgoing = st.rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0)
  return { ok: incoming === st.totals.incoming && outgoing === st.totals.outgoing, incoming, outgoing }
}

// Выдуманная выписка в устройстве Сбера (координаты колонок — как в настоящей).
// Никаких реальных данных: магазины, суммы, имена и номера придуманы.
import type { TextLine } from '../types'

type Op = {
  date: string
  time: string
  category: string
  amount: string // «1 900,00» или «+300,00»
  balance: string
  processed: string
  auth: string
  desc: string[] // строки описания (первая — на строке 2, остальные — продолжение)
}

let y = 800
const line = (page: number, items: [number, string][]): TextLine => ({ page, y: (y -= 12), items: items.map(([x, s]) => ({ x, s })) })

export function sberLines(ops: Op[][], header = true): TextLine[] {
  y = 800
  const out: TextLine[] = []
  if (header) {
    out.push(line(1, [[150, '900 www.sberbank.ru'], [430, 'Заказано в СберБанк Онлайн']]))
    out.push(line(1, [[45, 'Выписка по платёжному счёту']]))
    out.push(line(1, [[45, 'За период 01.10.2026 — 31.10.2026']]))
    out.push(line(1, [[400, 'ИТОГО ПО ОПЕРАЦИЯМ ЗА ПЕРИОД:']]))
    out.push(line(1, [[50, 'Владелец счёта']]))
    out.push(line(1, [[50, 'Тестов Тест Тестович'], [400, 'Остаток на 01.10.2026'], [520, '10 000,00']]))
    out.push(line(1, [[400, 'Пополнение'], [520, 'TOTAL_IN']]))
    out.push(line(1, [[50, 'Номер счёта'], [200, '40817 810 0 0000 0001234'], [400, 'Списание'], [520, 'TOTAL_OUT']]))
    out.push(line(1, [[50, 'Карты, привязанные к счёту'], [200, 'МИР Сберкарта •• 5555'], [400, 'Остаток на 31.10.2026'], [520, '9 610,02']]))
    out.push(line(1, [[45, 'ДАТА ОПЕРАЦИИ (МСК)'], [152, 'КАТЕГОРИЯ'], [400, 'СУММА В ВАЛЮТЕ СЧЁТА'], [520, 'ОСТАТОК СРЕДСТВ']]))
    out.push(line(1, [[45, 'Дата обработки1'], [152, 'Описание операции']]))
  }
  ops.forEach((pageOps, pi) => {
    const page = pi + 1
    if (pi > 0) {
      y = 800
      out.push(line(page, [[45, 'Выписка по платёжному счёту'], [480, `Страница ${page} из ${ops.length}`]]))
      out.push(line(page, [[45, 'ДАТА ОПЕРАЦИИ (МСК)'], [152, 'КАТЕГОРИЯ'], [400, 'СУММА В ВАЛЮТЕ СЧЁТА'], [520, 'ОСТАТОК СРЕДСТВ']]))
    }
    for (const op of pageOps) {
      out.push(line(page, [[45, op.date], [102, op.time], [152, op.category], [440, op.amount], [525, op.balance]]))
      out.push(line(page, [[45, op.processed], [102, op.auth], [152, op.desc[0]]]))
      for (const more of op.desc.slice(1)) out.push(line(page, [[152, more]]))
    }
    out.push(line(page, [[200, 'Продолжение на следующей странице']]))
  })
  out.push(line(ops.length, [[45, 'ПАО Сбербанк. Генеральная лицензия Банка России']]))
  return out
}

export function withTotals(lines: TextLine[], incoming: string, outgoing: string): TextLine[] {
  return lines.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i, s: i.s.replace('TOTAL_IN', incoming).replace('TOTAL_OUT', outgoing) })) }))
}

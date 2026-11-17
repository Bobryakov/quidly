import { describe, expect, it } from 'vitest'
import { sberLines, withTotals } from './fixtures/sberLines'
import { groupTextItems } from './pdfText'
import { checkTotals, isSberStatement, parseSber } from './sber'

const ops = [
  [
    { date: '31.10.2026', time: '16:29', category: 'Супермаркеты', amount: '1 189,98', balance: '9 610,02', processed: '31.10.2026', auth: '585125', desc: ['MAGAZIN KOLOSOK 8813 MOSCOW RUS. Операция по карте', '****5555'] },
    { date: '30.10.2026', time: '19:56', category: 'Перевод на карту', amount: '+300,00', balance: '10 800,00', processed: '30.10.2026', auth: '614946', desc: ['Перевод от Т. Тест Тестович. Операция по счету', '****1234'] },
    { date: '29.10.2026', time: '09:19', category: 'Выдача наличных', amount: '1 200,00', balance: '10 500,00', processed: '30.10.2026', auth: '000483', desc: ['Банкомат №TEST1. Операция по карте ****5555', 'В сумму операции включена комиссия 200,00 руб.'] },
  ],
  [
    { date: '28.10.2026', time: '22:14', category: 'Рестораны и кафе', amount: '2 318,00', balance: '11 700,00', processed: '29.10.2026', auth: '003204', desc: ['CAFE ROMASHKA MOSKVA RUS. Операция по карте ****5555'] },
    { date: '27.10.2026', time: '18:03', category: 'Возврат, отмена операции', amount: '+1,00', balance: '14 018,00', processed: '27.10.2026', auth: '677614', desc: ['YM*TESTSHOP MOSCOW RUS. Операция по карте', '****5555'] },
    { date: '27.10.2026', time: '18:03', category: 'Прочие расходы', amount: '1,00', balance: '14 017,00', processed: '27.10.2026', auth: '677614', desc: ['YM*TESTSHOP MOSCOW RUS. Операция по карте', '****5555'] },
  ],
]

describe('выписка Сбера', () => {
  const lines = withTotals(sberLines(ops), '301,00', '4 708,98')

  it('узнаётся по шапке', () => {
    expect(isSberStatement(lines)).toBe(true)
    const other = [{ page: 1, y: 800, items: [{ x: 45, s: 'Выписка по карте Другой банк' }] }]
    expect(isSberStatement(other)).toBe(false)
  })

  it('читает все операции, в том числе на второй странице', () => {
    const st = parseSber(lines)
    expect(st.rows).toHaveLength(6)
    expect(st.period).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(st.last4).toEqual(expect.arrayContaining(['5555', '1234']))
    expect(st.closing).toEqual({ date: '2026-10-31', amount: 961002 })
  })

  it('дата, время, сумма, направление, категория банка, код авторизации', () => {
    const [shop, income] = parseSber(lines).rows
    expect(shop).toEqual({
      date: '2026-10-31', time: '16:29', amount: 118998, direction: 'out',
      description: 'MAGAZIN KOLOSOK 8813 MOSCOW RUS', bankCategory: 'Супермаркеты', authCode: '585125',
    })
    expect(income).toMatchObject({ amount: 30000, direction: 'in', bankCategory: 'Перевод на карту' })
  })

  it('описание в несколько строк склеивается, хвост «Операция по карте ****» убирается', () => {
    const rows = parseSber(lines).rows
    expect(rows[1].description).toBe('Перевод от Т. Тест Тестович')
    expect(rows[3].description).toBe('CAFE ROMASHKA MOSKVA RUS')
  })

  it('комиссия в сумме выдачи наличных выделяется отдельно', () => {
    const cash = parseSber(lines).rows[2]
    expect(cash).toMatchObject({ amount: 120000, fee: 20000, description: 'Банкомат №TEST1', bankCategory: 'Выдача наличных' })
  })

  it('сверка с итогами шапки', () => {
    expect(checkTotals(parseSber(lines))).toEqual({ ok: true, incoming: 30100, outgoing: 470898 })
    const wrong = withTotals(sberLines(ops), '999,00', '4 708,98')
    expect(checkTotals(parseSber(wrong))?.ok).toBe(false)
  })
})

describe('строки PDF', () => {
  it('кусочки текста одной высоты собираются в строку слева направо', () => {
    const lines = groupTextItems(1, [
      { str: '1 900,00', transform: [1, 0, 0, 1, 437, 700] },
      { str: '16.11.2026', transform: [1, 0, 0, 1, 45, 700.6] },
      { str: '15:20', transform: [1, 0, 0, 1, 102, 701] },
      { str: 'описание', transform: [1, 0, 0, 1, 152, 688] },
      { str: '  ', transform: [1, 0, 0, 1, 300, 700] },
    ])
    expect(lines.map((l) => l.items.map((i) => i.s))).toEqual([['16.11.2026', '15:20', '1 900,00'], ['описание']])
  })
})

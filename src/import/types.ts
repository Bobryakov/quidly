// Общие типы импорта выписок.

/** Одна операция, прочитанная из файла банка (ещё не записана в базу). */
export interface ParsedRow {
  /** 'ГГГГ-ММ-ДД' — дата операции (не дата обработки банком) */
  date: string
  /** 'ЧЧ:ММ', если есть в выписке */
  time?: string
  /** Копейки, > 0 */
  amount: number
  /** in — поступление, out — списание */
  direction: 'in' | 'out'
  /** Описание без служебных хвостов: «PYATEROCHKA 8813 MOSCOW RUS», «Перевод в T-Bank» */
  description: string
  /** Категория банка: «Супермаркеты», «Перевод СБП» … */
  bankCategory?: string
  /** Код вида покупки (MCC), если банк его даёт */
  mcc?: string
  /** Код авторизации — помогает различать одинаковые операции одного дня */
  authCode?: string
  /** Комиссия, включённая в сумму (копейки) — например, за снятие наличных */
  fee?: number
}

export interface ParsedStatement {
  /** Какой банк распознан */
  bank: 'sber' | 'generic'
  bankName: string
  rows: ParsedRow[]
  /** Период выписки, если указан */
  period?: { from: string; to: string }
  /** Последние 4 цифры карты/счёта — подсказка, на какой счёт импортировать */
  last4?: string[]
  /** Итоги из шапки выписки — для сверки «всё ли прочитали» */
  totals?: { incoming: number; outgoing: number }
  /** Остаток на конец периода по данным банка (копейки, может быть < 0) — чтобы выровнять баланс счёта */
  closing?: { date: string; amount: number }
}

/** Строка текста страницы PDF: кусочки текста с координатой x (слева направо). */
export interface TextLine {
  page: number
  y: number
  items: { x: number; s: string }[]
}

// Текст PDF → строки с координатами. Сама библиотека pdf.js подгружается только при импорте PDF.

import type { TextLine } from './types'

type RawItem = { str: string; transform: number[] }

/** Собирает кусочки текста страницы в строки: одинаковая высота (±2) — одна строка, слева направо. */
export function groupTextItems(page: number, items: RawItem[]): TextLine[] {
  const lines: TextLine[] = []
  const sorted = items
    .filter((i) => i.str.trim())
    .map((i) => ({ x: Math.round(i.transform[4]), y: Math.round(i.transform[5]), s: i.str }))
    .sort((a, b) => b.y - a.y || a.x - b.x)
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 2)
    if (line) line.items.push({ x: it.x, s: it.s })
    else lines.push({ page, y: it.y, items: [{ x: it.x, s: it.s }] })
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x)
  return lines.sort((a, b) => b.y - a.y)
}

/** Читает PDF (в браузере) и возвращает строки всех страниц по порядку. */
export async function readPdfLines(data: ArrayBuffer): Promise<TextLine[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const out: TextLine[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    out.push(...groupTextItems(p, content.items.filter((i): i is RawItem & typeof i => 'str' in i)))
  }
  return out
}

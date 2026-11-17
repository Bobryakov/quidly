// @vitest-environment node
/// <reference types="node" />
// Проверка на НАСТОЯЩЕЙ выписке Сбера из папки samples/ (если она есть на этом компьютере).
// Файлы samples/ не попадают в git, поэтому на GitHub эта проверка просто пропускается.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { groupTextItems } from './pdfText'
import { checkTotals, isSberStatement, parseSber } from './sber'
import type { TextLine } from './types'

const dir = path.resolve(process.cwd(), 'samples')
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f: string) => f.toLowerCase().endsWith('.pdf')) : []

async function lines(file: string): Promise<TextLine[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(dir, file))) }).promise
  const out: TextLine[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const c = await (await pdf.getPage(p)).getTextContent()
    out.push(...groupTextItems(p, c.items.filter((i) => 'str' in i) as never))
  }
  return out
}

describe.skipIf(files.length === 0)('настоящие выписки из samples/', () => {
  it.each(files)('%s: если это Сбер — все операции прочитаны, итоги сходятся', async (file: string) => {
    const l = await lines(file)
    if (!isSberStatement(l)) return
    const st = parseSber(l)
    expect(st.rows.length).toBeGreaterThan(0)
    expect(checkTotals(st)?.ok).toBe(true)
    expect(st.closing?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const r of st.rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(r.amount).toBeGreaterThan(0)
      expect(r.description.length).toBeGreaterThan(0)
      expect(r.description).not.toMatch(/Операция по/)
    }
  }, 30_000)
})

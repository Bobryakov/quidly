import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { EmojiBubble } from '../components/Pickers'
import { CloseButton, Sheet } from '../components/Sheet'
import { db } from '../db/db'
import { useAccounts, useById, useCategories, useLastAccountId } from '../db/hooks'
import { applyImport } from '../db/repo'
import type { Account } from '../db/types'
import { decodeText, findHeaderRow, genericStatement, guessMapping, mapTable, parseCsv, parseXlsx, type Mapping, type Table } from '../import/generic'
import { readPdfLines } from '../import/pdfText'
import { applyCategoryChoice, balanceAfterImport, buildPlan, planSummary, toggleTransfer, type ImportItem } from '../import/plan'
import { checkTotals, isSberStatement, parseSber } from '../import/sber'
import type { ParsedStatement } from '../import/types'
import { dayTitle, isoToRu, monthKey, todayISO } from '../lib/dates'
import { formatMoney, opsWord } from '../lib/format'
import { showToast } from '../lib/store'

const money = (k: number) => formatMoney(k, { hideZeroKopecks: true })

type Stage =
  | { step: 'pick'; error?: string; loading?: boolean }
  | { step: 'map'; fileName: string; table: Table; header: number; mapping: Partial<Mapping> }
  | { step: 'preview'; fileName: string; statement: ParsedStatement }

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>({ step: 'pick' })

  return (
    <>
      <Link to="/settings" className="mb-2 inline-block text-sm font-medium text-violet-600 dark:text-violet-400">
        ‹ Настройки
      </Link>
      <PageHeader title="Импорт выписки" />
      {stage.step === 'pick' && <PickFile stage={stage} setStage={setStage} />}
      {stage.step === 'map' && <MapColumns stage={stage} setStage={setStage} />}
      {stage.step === 'preview' && <Preview key={stage.fileName} stage={stage} onReset={() => setStage({ step: 'pick' })} />}
    </>
  )
}

// ---------- шаг 1: файл ----------

function PickFile({ stage, setStage }: { stage: Extract<Stage, { step: 'pick' }>; setStage: (s: Stage) => void }) {
  const input = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    setStage({ step: 'pick', loading: true })
    try {
      const bytes = await file.arrayBuffer()
      const name = file.name.toLowerCase()
      if (name.endsWith('.pdf')) {
        const lines = await readPdfLines(bytes)
        if (!isSberStatement(lines)) {
          return setStage({
            step: 'pick',
            error: 'Этот PDF пока не умею читать. Сейчас из PDF поддерживается выписка Сбера «по платёжному счёту». Попробуйте выгрузить CSV или Excel.',
          })
        }
        const statement = parseSber(lines)
        if (statement.rows.length === 0) return setStage({ step: 'pick', error: 'В выписке не нашлось ни одной операции.' })
        return setStage({ step: 'preview', fileName: file.name, statement })
      }
      let table: Table
      if (name.endsWith('.csv') || name.endsWith('.txt')) table = await parseCsv(decodeText(bytes))
      else if (name.endsWith('.xlsx') || name.endsWith('.xls')) table = await parseXlsx(bytes)
      else return setStage({ step: 'pick', error: 'Подходят файлы PDF (Сбер), CSV и Excel (.xlsx, .xls).' })
      if (table.length < 2) return setStage({ step: 'pick', error: 'Файл пустой или не похож на таблицу.' })
      const header = findHeaderRow(table)
      setStage({ step: 'map', fileName: file.name, table, header, mapping: guessMapping(table[header]) })
    } catch (e) {
      console.error(e)
      setStage({ step: 'pick', error: 'Не получилось прочитать файл. Если ошибка повторяется — пришлите мне этот файл (без личных данных).' })
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={stage.loading}
        className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-violet-300 bg-white px-6 py-10 text-center shadow-sm disabled:opacity-60 dark:border-violet-500/40 dark:bg-slate-900"
      >
        <span className="text-5xl" aria-hidden>
          {stage.loading ? '⏳' : '📥'}
        </span>
        <span className="text-lg font-semibold">{stage.loading ? 'Читаю файл…' : 'Выбрать файл выписки'}</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">PDF Сбера · CSV · Excel</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".pdf,.csv,.txt,.xlsx,.xls,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        aria-label="Файл выписки"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />
      {stage.error && (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
          {stage.error}
        </p>
      )}
      <p className="px-2 text-center text-sm text-slate-500 dark:text-slate-400">
        🔐 Файл читается только на этом устройстве и никуда не отправляется. Перед сохранением покажу всё, что нашёл.
      </p>
    </div>
  )
}

// ---------- шаг 1б: колонки (CSV / Excel) ----------

const FIELDS: { key: keyof Mapping; label: string; required?: boolean }[] = [
  { key: 'date', label: 'Дата', required: true },
  { key: 'description', label: 'Описание', required: true },
  { key: 'amount', label: 'Сумма (со знаком −/+)' },
  { key: 'income', label: 'или Поступления' },
  { key: 'expense', label: 'и Списания' },
  { key: 'category', label: 'Категория банка' },
  { key: 'mcc', label: 'MCC-код' },
]

function MapColumns({ stage, setStage }: { stage: Extract<Stage, { step: 'map' }>; setStage: (s: Stage) => void }) {
  const { table, header, mapping } = stage
  const columns = table[header].map((c, i) => String(c ?? '').trim() || `Колонка ${i + 1}`)
  const complete =
    mapping.date !== undefined &&
    mapping.description !== undefined &&
    (mapping.amount !== undefined || (mapping.income !== undefined && mapping.expense !== undefined))
  const result = complete ? mapTable(table, header, mapping as Mapping) : null
  const set = (patch: Partial<Mapping>) => setStage({ ...stage, mapping: { ...mapping, ...patch } })

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <h2 className="font-semibold">Где что лежит в файле?</h2>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Я угадал по названиям колонок — проверьте.</p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <span className="w-36 shrink-0 text-slate-500">Строка заголовков</span>
          <select
            value={header}
            onChange={(e) => {
              const h = Number(e.target.value)
              setStage({ ...stage, header: h, mapping: guessMapping(table[h]) })
            }}
            className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"
            aria-label="Строка заголовков"
          >
            {table.slice(0, 30).map((r, i) => (
              <option key={i} value={i}>
                {i + 1}: {r.map((c) => String(c ?? '')).join(' | ').slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
        {FIELDS.map((f) => (
          <label key={f.key} className="mb-2 flex items-center gap-2 text-sm">
            <span className="w-36 shrink-0 text-slate-500">
              {f.label}
              {f.required && ' *'}
            </span>
            <select
              value={mapping[f.key] === undefined ? '' : String(mapping[f.key])}
              onChange={(e) => set({ [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="min-w-0 flex-1 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"
              aria-label={f.label}
            >
              <option value="">— нет —</option>
              {columns.map((c, i) => (
                <option key={i} value={i}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ))}
        {mapping.amount !== undefined && (
          <label className="mt-2 flex items-center gap-3 text-sm">
            <input type="checkbox" checked={Boolean(mapping.expensesPositive)} onChange={(e) => set({ expensesPositive: e.target.checked })} className="h-5 w-5 accent-violet-600" />
            Расходы в файле записаны без минуса (поступления — с «+»)
          </label>
        )}
      </section>

      {result && (
        <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900" aria-label="Пример строк">
          <h2 className="mb-2 font-semibold">
            Нашлось {opsWord(result.rows.length)}
            {result.skipped > 0 && <span className="text-sm font-normal text-slate-500"> · пропущено строк без даты/суммы: {result.skipped}</span>}
          </h2>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {result.rows.slice(0, 5).map((r, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  {isoToRu(r.date)} · {r.description}
                </span>
                <span className={`tabular shrink-0 ${r.direction === 'in' ? 'text-emerald-600' : ''}`}>
                  {r.direction === 'in' ? '+' : '−'}
                  {money(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => setStage({ step: 'pick' })} className="rounded-2xl bg-slate-100 px-5 py-3.5 font-medium dark:bg-slate-800">
          ‹ Назад
        </button>
        <button
          type="button"
          disabled={!result || result.rows.length === 0}
          onClick={() => result && setStage({ step: 'preview', fileName: stage.fileName, statement: genericStatement(result.rows) })}
          className="flex-1 rounded-2xl bg-violet-600 py-3.5 font-semibold text-white disabled:opacity-40"
        >
          Дальше
        </button>
      </div>
    </div>
  )
}

// ---------- шаг 2: предпросмотр ----------

function defaultAccount(accounts: Account[], st: ParsedStatement, last: string | null | undefined): string | undefined {
  const active = accounts.filter((a) => !a.archived)
  const byBank = st.bank === 'sber' ? active.find((a) => /сбер|sber/i.test(a.name)) : undefined
  return (byBank ?? active.find((a) => a.id === last) ?? active[0])?.id
}

function Preview({ stage, onReset }: { stage: Extract<Stage, { step: 'preview' }>; onReset: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const lastAccountId = useLastAccountId()
  const catById = useById(categories)
  const accById = useById(accounts)
  const navigate = useNavigate()
  const ctx = useLiveQuery(async () => ({
    rules: await db.importRules.toArray(),
    transactions: await db.transactions.toArray(),
    subscriptions: await db.subscriptions.toArray(),
  }))

  const [accountId, setAccountId] = useState<string>()
  const [edits, setEdits] = useState<{ account: string; items: ImportItem[] } | null>(null)
  const [rules, setRules] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState<number | null>(null)
  const [transferPick, setTransferPick] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [align, setAlign] = useState(true)

  const account = accountId ?? (accounts && lastAccountId !== undefined ? defaultAccount(accounts, stage.statement, lastAccountId) : undefined)

  // План строится заново при смене счёта; правки человека живут, пока счёт тот же
  const basePlan = useMemo(() => {
    if (!accounts || !categories || !ctx || !account) return null
    return buildPlan({ statement: stage.statement, accountId: account, accounts, categories, ...ctx })
  }, [accounts, categories, ctx, account, stage.statement])
  const items = edits && edits.account === account ? edits.items : basePlan

  if (!accounts || !categories || !items || !account) return <p className="text-slate-500">Готовлю предпросмотр…</p>

  const update = (next: ImportItem[]) => setEdits({ account, items: next })
  const summary = planSummary(items)
  const check = stage.statement.bank === 'sber' ? checkTotals(stage.statement) : null
  const today = todayISO()
  const closing = stage.statement.closing
  const target = accById.get(account)
  const predicted = closing && target ? balanceAfterImport(target, ctx!.transactions, items, closing.date) : null
  const mismatch = closing && predicted !== null && predicted !== closing.amount

  const days = new Map<string, number[]>()
  items.forEach((it, i) => days.set(it.row.date, [...(days.get(it.row.date) ?? []), i]))
  const ordered = [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))

  const doImport = async () => {
    setSaving(true)
    try {
      const n = await applyImport(
        items,
        account,
        Object.entries(rules).map(([pattern, categoryId]) => ({ pattern, categoryId })),
        mismatch && align ? closing : undefined,
      )
      showToast(`✓ Импортировано: ${opsWord(n)}`)
      const latest = items.reduce((m, i) => (i.row.date > m ? i.row.date : m), '')
      navigate(`/operations?account=${account}&month=${monthKey(latest || today)}`)
    } catch (e) {
      showToast((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 pb-24">
      <section className="rounded-3xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {stage.statement.bankName} · {stage.fileName}
          {stage.statement.period && ` · ${isoToRu(stage.statement.period.from)} — ${isoToRu(stage.statement.period.to)}`}
        </p>
        {check && (
          <p className={`mt-1 text-sm font-medium ${check.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} role="status" aria-label="Сверка с выпиской">
            {check.ok
              ? `✓ Прочитано ${opsWord(items.length)} — суммы сходятся с итогами выписки`
              : '⚠️ Суммы не сходятся с итогами выписки — возможно, часть операций не прочиталась. Проверьте список.'}
          </p>
        )}
        <p className="mt-3 mb-1.5 text-sm font-medium">На какой счёт импортировать?</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Счёт для импорта">
          {accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={a.id === account}
                onClick={() => setAccountId(a.id)}
                className={`rounded-full border-2 px-3 py-1.5 text-sm font-medium ${
                  a.id === account
                    ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                    : 'border-transparent bg-slate-100 dark:bg-slate-800'
                }`}
              >
                {a.emoji} {a.name}
              </button>
            ))}
        </div>
        {closing && predicted !== null && (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60" aria-label="Остаток по выписке">
            {mismatch ? (
              <>
                <p>
                  По выписке на {isoToRu(closing.date)} на счёте <b className="tabular">{money(closing.amount)}</b>, а в Quidly после импорта
                  будет <b className="tabular">{money(predicted)}</b>.
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" checked={align} onChange={(e) => setAlign(e.target.checked)} className="mt-0.5 h-5 w-5 accent-violet-600" />
                  <span>
                    Выровнять остаток «{target?.name}» по выписке
                    <span className="block text-xs text-slate-500">Так бывает, если остаток вписан «на сегодня», а импортируются прошлые операции.</span>
                  </span>
                </label>
              </>
            ) : (
              <p className="text-emerald-700 dark:text-emerald-400">✓ Остаток «{target?.name}» на {isoToRu(closing.date)} совпадёт с банком: {money(closing.amount)}</p>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Сводка импорта">
          <span className="rounded-full bg-violet-100 px-2.5 py-1 font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
            к импорту: {summary.selected}
          </span>
          {summary.transfers > 0 && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">переводов на свои счета: {summary.transfers}</span>}
          {summary.duplicates > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">уже импортировано: {summary.duplicates}</span>}
          {summary.possible > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">похоже на ваши записи: {summary.possible}</span>}
          {summary.refunds > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">взаимозачёт возвратов: {summary.refunds}</span>}
        </div>
      </section>

      {ordered.map(([date, idx]) => (
        <section key={date} className="rounded-3xl bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
          <h2 className="px-1 pt-1 pb-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{dayTitle(date, today)}</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {idx.map((i) => (
              <ItemRow
                key={items[i].key}
                item={items[i]}
                category={items[i].categoryId ? catById.get(items[i].categoryId!) : undefined}
                counter={items[i].counterAccountId ? accById.get(items[i].counterAccountId!) : undefined}
                onToggle={() => update(items.map((it, j) => (j === i ? { ...it, include: !it.include } : it)))}
                onCategory={() => setPicking(i)}
                onTransfer={() => setTransferPick(i)}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="fixed inset-x-0 z-30 mx-auto max-w-lg px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}>
        <div className="flex gap-2 rounded-3xl bg-white/90 p-2 shadow-xl backdrop-blur dark:bg-slate-900/90">
          <button type="button" onClick={onReset} className="rounded-2xl bg-slate-100 px-4 py-3 font-medium dark:bg-slate-800">
            Другой файл
          </button>
          <button
            type="button"
            onClick={doImport}
            disabled={saving || summary.selected === 0}
            className="flex-1 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-500 py-3 font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Сохраняю…' : `Импортировать: ${summary.selected}`}
          </button>
        </div>
      </div>

      <Sheet open={transferPick !== null} onClose={() => setTransferPick(null)} label="Перевод на свой счёт">
        {transferPick !== null && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">Это перевод между своими счетами?</h2>
                <p className="truncate text-sm text-slate-500">{items[transferPick].row.description}</p>
              </div>
              <CloseButton onClick={() => setTransferPick(null)} />
            </div>
            <p className="mb-2 text-sm text-slate-500">
              {items[transferPick].row.direction === 'out' ? 'Куда ушли деньги:' : 'Откуда пришли деньги:'}
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {accounts
                .filter((a) => !a.archived && a.id !== account)
                .map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      const it = items[transferPick]
                      const next: ImportItem = { ...it, kind: 'transfer', counterAccountId: a.id, categoryId: undefined, categorySource: undefined }
                      update(items.map((x, j) => (j === transferPick ? next : x)))
                      setTransferPick(null)
                    }}
                    className={`rounded-full border-2 px-3 py-1.5 text-sm font-medium ${
                      items[transferPick].counterAccountId === a.id ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' : 'border-transparent bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {a.emoji} {a.name}
                  </button>
                ))}
            </div>
            {items[transferPick].kind === 'transfer' && (
              <button
                type="button"
                onClick={() => {
                  update(items.map((x, j) => (j === transferPick ? toggleTransfer(x, account, accounts, categories, ctx!.rules) : x)))
                  setTransferPick(null)
                }}
                className="w-full rounded-2xl bg-slate-100 py-3 font-medium dark:bg-slate-800"
              >
                Нет, это {items[transferPick].row.direction === 'out' ? 'расход' : 'доход'}
              </button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={picking !== null} onClose={() => setPicking(null)} label="Категория">
        {picking !== null && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">Категория</h2>
                <p className="truncate text-sm text-slate-500">{items[picking].row.description}</p>
              </div>
              <CloseButton onClick={() => setPicking(null)} />
            </div>
            <p className="mb-2 text-xs text-slate-500">Запомню выбор — в следующих выписках этот продавец сразу попадёт в эту категорию.</p>
            <div className="grid grid-cols-4 gap-2">
              {categories
                .filter((c) => c.kind === items[picking].kind)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const { items: next, pattern } = applyCategoryChoice(items, picking, c.id)
                      update(next)
                      if (pattern) setRules({ ...rules, [pattern]: c.id })
                      setPicking(null)
                    }}
                    className="flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[11px] font-medium"
                    style={{ backgroundColor: `${c.color}1f` }}
                  >
                    <span className="text-2xl">{c.emoji}</span>
                    <span className="line-clamp-2 text-center">{c.name}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function ItemRow({
  item,
  category,
  counter,
  onToggle,
  onCategory,
  onTransfer,
}: {
  item: ImportItem
  category?: { emoji: string; color: string; name: string }
  counter?: Account
  onToggle: () => void
  onCategory: () => void
  onTransfer: () => void
}) {
  const r = item.row
  const muted = !item.include
  const badge =
    item.status === 'duplicate'
      ? { text: 'уже импортировано', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800' }
      : item.status === 'possible-duplicate'
        ? { text: 'похоже на вашу запись', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' }
        : item.status === 'refund-pair'
          ? { text: 'возврат погасил покупку', cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800' }
          : null

  return (
    <li className={`flex items-center gap-2 py-2 ${muted ? 'opacity-55' : ''}`} aria-label={`Строка: ${r.description}`}>
      <input type="checkbox" checked={item.include} onChange={onToggle} className="h-5 w-5 shrink-0 accent-violet-600" aria-label={`Импортировать «${r.description}»`} />
      {item.kind === 'transfer' ? (
        <EmojiBubble emoji="⇄" color="#0ea5e9" size="sm" />
      ) : (
        <button type="button" onClick={onCategory} aria-label={`Категория: ${category?.name}`} className="shrink-0">
          <EmojiBubble emoji={category?.emoji ?? '❔'} color={category?.color ?? '#94a3b8'} size="sm" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{r.description}</p>
        <p className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          {item.kind === 'transfer' ? (
            <button type="button" onClick={onTransfer} className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
              ⇄ {r.direction === 'out' ? 'на' : 'с'} «{counter?.name}» ✎
            </button>
          ) : (
            <>
              <button type="button" onClick={onCategory} className="underline decoration-dotted">
                {category?.name}
              </button>
              {r.bankCategory && <span>· {r.bankCategory}</span>}
              {/перевод|наличн/i.test(`${r.bankCategory ?? ''} ${r.description}`) && (
                <button type="button" onClick={onTransfer} className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  ⇄ себе?
                </button>
              )}
            </>
          )}
          {item.fee ? <span>· комиссия {money(item.fee)} — отдельной тратой</span> : null}
          {item.subscriptionId && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">🔁 подписка</span>}
          {badge && <span className={`rounded-full px-2 py-0.5 ${badge.cls}`}>{badge.text}</span>}
        </p>
      </div>
      <span className={`tabular shrink-0 text-sm font-semibold ${r.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : item.kind === 'transfer' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
        {r.direction === 'in' ? '+' : '−'}
        {money(r.amount)}
      </span>
    </li>
  )
}

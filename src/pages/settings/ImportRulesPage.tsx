import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { EmojiBubble } from '../../components/Pickers'
import { CloseButton, Sheet } from '../../components/Sheet'
import { db } from '../../db/db'
import { useById, useCategories } from '../../db/hooks'
import { deleteImportRule, saveImportRule } from '../../db/repo'
import type { ImportRule } from '../../db/types'
import { showToast } from '../../lib/store'
import { BackLink } from './AccountsPage'

/** Правила автокатегорий: «PYATEROCHKA → Продукты». Появляются, когда вы правите категорию при импорте. */
export function ImportRulesPage() {
  const rules = useLiveQuery(() => db.importRules.orderBy('pattern').toArray(), [])
  const categories = useCategories()
  const catById = useById(categories)
  const [editing, setEditing] = useState<ImportRule | 'new' | null>(null)

  if (!rules || !categories) return null

  return (
    <>
      <BackLink />
      <PageHeader title="Правила импорта" />
      <p className="-mt-2 mb-4 text-sm text-slate-500 dark:text-slate-400">
        Если описание операции в выписке содержит слово слева — она сразу попадёт в категорию справа.
      </p>
      {rules.length === 0 ? (
        <EmptyState emoji="🪄" title="Правил пока нет" hint="Они появятся сами, когда при импорте вы поправите категорию" />
      ) : (
        <section className="rounded-3xl bg-white px-4 py-1 shadow-sm dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rules.map((r) => {
              const c = catById.get(r.categoryId)
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => setEditing(r)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{r.pattern}</span>
                    <span className="text-slate-400">→</span>
                    <EmojiBubble emoji={c?.emoji ?? '❔'} color={c?.color ?? '#94a3b8'} size="sm" />
                    <span className="w-28 truncate text-sm">{c?.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <button
        type="button"
        onClick={() => setEditing('new')}
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-violet-200 py-3 font-medium text-violet-600 dark:border-violet-500/30 dark:text-violet-300"
      >
        + Добавить правило
      </button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Правило">
        {editing && <RuleForm key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  )
}

function RuleForm({ rule, onDone }: { rule?: ImportRule; onDone: () => void }) {
  const categories = useCategories()
  const [pattern, setPattern] = useState(rule?.pattern ?? '')
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '')
  const [error, setError] = useState('')
  if (!categories) return null

  const save = async () => {
    if (pattern.trim().length < 3) return setError('Впишите хотя бы 3 буквы — например, PYATEROCHKA')
    if (!categoryId) return setError('Выберите категорию')
    if (rule && rule.pattern !== pattern.trim().toUpperCase()) await deleteImportRule(rule.id)
    await saveImportRule(pattern, categoryId)
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{rule ? 'Правило' : 'Новое правило'}</h2>
        <CloseButton onClick={onDone} />
      </div>
      <input
        value={pattern}
        onChange={(e) => {
          setError('')
          setPattern(e.target.value)
        }}
        placeholder="Слово из описания, например PYATEROCHKA"
        aria-label="Слово из описания"
        className="rounded-2xl bg-slate-100 px-4 py-3 font-mono uppercase dark:bg-slate-800"
      />
      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Категория</p>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Категория">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[11px] font-medium ${categoryId === c.id ? 'ring-2 ring-violet-500' : ''}`}
              style={{ backgroundColor: `${c.color}1f` }}
            >
              <span className="text-xl">{c.emoji}</span>
              <span className="line-clamp-1">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="h-5 text-sm font-medium text-rose-500" role="alert">
        {error}
      </p>
      <button type="button" onClick={save} className="rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
        Сохранить
      </button>
      {rule && (
        <button
          type="button"
          onClick={async () => {
            await deleteImportRule(rule.id)
            showToast('🗑 Правило удалено')
            onDone()
          }}
          className="rounded-2xl bg-rose-50 py-3 font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
        >
          🗑 Удалить правило
        </button>
      )}
    </div>
  )
}

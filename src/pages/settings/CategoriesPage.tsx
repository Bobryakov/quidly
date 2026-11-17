import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import { ColorPicker, EmojiBubble, EmojiPicker } from '../../components/Pickers'
import { CloseButton, Sheet } from '../../components/Sheet'
import { db } from '../../db/db'
import { useCategories } from '../../db/hooks'
import { createCategory, deleteCategory, mergeCategories, updateCategory } from '../../db/repo'
import type { Category, CategoryKind } from '../../db/types'
import { opsWord } from '../../lib/format'
import { showToast } from '../../lib/store'
import { BackLink } from './AccountsPage'

type Editing = { mode: 'new'; kind: CategoryKind } | { mode: 'edit'; category: Category }

export function CategoriesPage() {
  const categories = useCategories()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [editing, setEditing] = useState<Editing | null>(null)

  // Сколько операций в каждой категории
  const usage = useLiveQuery(async () => {
    const counts = new Map<string, number>()
    await db.transactions.each((t) => {
      if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
    })
    return counts
  }, [])

  const list = useMemo(() => (categories ?? []).filter((c) => c.kind === kind), [categories, kind])
  if (!categories || !usage) return null

  return (
    <>
      <BackLink />
      <PageHeader title="Категории" />

      <div className="mb-3 flex rounded-2xl bg-white p-1 shadow-sm dark:bg-slate-900" role="radiogroup" aria-label="Вид категорий">
        {(['expense', 'income'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-xl py-2 font-semibold ${
              kind === k ? 'bg-violet-600 text-white' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {k === 'expense' ? 'Расходы' : 'Доходы'}
          </button>
        ))}
      </div>

      <section className="rounded-3xl bg-white px-4 py-1 shadow-sm dark:bg-slate-900">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setEditing({ mode: 'edit', category: c })}
              className="flex w-full items-center gap-3 py-2.5 text-left"
            >
              <EmojiBubble emoji={c.emoji} color={c.color} />
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-sm text-slate-400">{usage.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </section>
      <button
        type="button"
        onClick={() => setEditing({ mode: 'new', kind })}
        className="mt-3 w-full rounded-2xl border-2 border-dashed border-violet-200 py-3 font-medium text-violet-600 dark:border-violet-500/30 dark:text-violet-300"
      >
        + Добавить категорию
      </button>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} label="Категория">
        {editing && (
          <CategoryForm
            key={editing.mode === 'edit' ? editing.category.id : 'new'}
            editing={editing}
            siblings={list}
            usageCount={editing.mode === 'edit' ? (usage.get(editing.category.id) ?? 0) : 0}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  )
}

function CategoryForm({
  editing,
  siblings,
  usageCount,
  onDone,
}: {
  editing: Editing
  siblings: Category[]
  usageCount: number
  onDone: () => void
}) {
  const c = editing.mode === 'edit' ? editing.category : undefined
  const [name, setName] = useState(c?.name ?? '')
  const [emoji, setEmoji] = useState(c?.emoji ?? '⭐')
  const [color, setColor] = useState(c?.color ?? '#a855f7')
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    try {
      if (c) await updateCategory(c.id, { name, emoji, color })
      else if (editing.mode === 'new') await createCategory({ name, emoji, color, kind: editing.kind })
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async () => {
    if (usageCount > 0) {
      setMerging(true)
      return
    }
    if (!window.confirm(`Удалить категорию «${c!.name}»?`)) return
    try {
      await deleteCategory(c!.id)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const mergeInto = async (target: Category) => {
    const msg =
      usageCount > 0
        ? `Перенести ${opsWord(usageCount)} из «${c!.name}» в «${target.name}» и удалить «${c!.name}»?`
        : `Удалить «${c!.name}» (объединить с «${target.name}»)?`
    if (!window.confirm(msg)) return
    try {
      const moved = await mergeCategories(c!.id, target.id)
      showToast(`🔀 Готово: ${opsWord(moved)} теперь в «${target.name}»`)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (merging && c) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Куда перенести операции?</h2>
          <CloseButton onClick={onDone} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {usageCount > 0 ? `В «${c.name}» ${opsWord(usageCount)}. ` : ''}Они перейдут в выбранную категорию, а «{c.name}» будет
          удалена.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {siblings
            .filter((s) => s.id !== c.id)
            .map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => mergeInto(s)}
                className="flex items-center gap-2 rounded-2xl p-2 text-left text-sm font-medium"
                style={{ backgroundColor: `${s.color}1f` }}
              >
                <span className="text-xl">{s.emoji}</span>
                {s.name}
              </button>
            ))}
        </div>
        <p className="h-5 text-sm font-medium text-rose-500" role="alert">
          {error}
        </p>
        <button type="button" onClick={() => setMerging(false)} className="rounded-2xl bg-slate-100 py-3 font-medium dark:bg-slate-800">
          ‹ Назад
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{c ? 'Категория' : 'Новая категория'}</h2>
        <CloseButton onClick={onDone} />
      </div>
      <div className="flex items-center gap-3">
        <EmojiBubble emoji={emoji} color={color} size="lg" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название"
          aria-label="Название категории"
          className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-3 font-medium dark:bg-slate-800"
        />
      </div>
      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Значок</p>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </div>
      <div>
        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">Цвет</p>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <p className="h-5 text-sm font-medium text-rose-500" role="alert">
        {error}
      </p>
      <button type="button" onClick={save} className="rounded-2xl bg-violet-600 py-3.5 font-semibold text-white">
        Сохранить
      </button>
      {c && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMerging(true)} className="flex-1 rounded-2xl bg-slate-100 py-3 font-medium dark:bg-slate-800">
            🔀 Объединить
          </button>
          <button
            type="button"
            onClick={remove}
            className="flex-1 rounded-2xl bg-rose-50 py-3 font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
          >
            🗑 Удалить
          </button>
        </div>
      )}
    </div>
  )
}

type Props = {
  emoji: string
  title: string
  hint: string
}

/** Дружелюбный пустой экран: большая эмодзи, заголовок и подсказка, что сделать. */
export function EmptyState({ emoji, title, hint }: Props) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-white px-6 py-10 text-center shadow-sm dark:bg-slate-900">
      <div className="mb-3 text-6xl" aria-hidden>
        {emoji}
      </div>
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  )
}

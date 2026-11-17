import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'

export function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Аналитика" />
      <EmptyState
        emoji="📊"
        title="Здесь появятся графики"
        hint="Добавь несколько трат — и увидишь, куда уходят деньги"
      />
    </>
  )
}

export function GoalsPage() {
  return (
    <>
      <PageHeader title="Цели" />
      <EmptyState emoji="🐷" title="Копилок пока нет" hint="Скоро здесь можно будет откладывать на мечту" />
    </>
  )
}

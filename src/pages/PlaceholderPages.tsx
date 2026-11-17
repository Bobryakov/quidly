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

import { useTranslation } from 'react-i18next'
import { PageContainer } from '@/components/primitives/PageContainer'

interface ComingSoonProps {
  title: string
  phase: string
}

/** Placeholder route element — proves routing/guards/nav wiring for a
 * screen this phase doesn't build yet, per docs/FRONTEND_IMPLEMENTATION_PLAN.md. */
export function ComingSoon({ title, phase }: ComingSoonProps) {
  const { t } = useTranslation()

  return (
    <PageContainer>
      <div className="flex flex-col gap-2 rounded-md border border-dashed border-text-secondary/30 bg-surface px-6 py-10">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        <p className="text-base text-text-secondary">
          {t('comingSoon.body', { phase })}
        </p>
      </div>
    </PageContainer>
  )
}

import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer } from '@/components/primitives/PageContainer'
import { Button } from '@/components/primitives/Button'

export function NotFound() {
  const { t } = useTranslation()

  return (
    <PageContainer>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">{t('notFound.title')}</h1>
        <p className="text-base text-text-secondary">{t('notFound.body')}</p>
        <Link to="/">
          <Button variant="primary">{t('common.backHome')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}

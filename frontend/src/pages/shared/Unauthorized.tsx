import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageContainer } from '@/components/primitives/PageContainer'
import { Button } from '@/components/primitives/Button'
import type { EmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'

type Reason = 'unverified-employer'

/** Plain explanatory message for a 403-shaped situation (e.g. an
 * unverified employer hitting a verified-only route) — never a bare
 * "Forbidden," per design spec §21. Distinguishes PENDING/UNVERIFIED
 * (still awaiting review) from REJECTED (a decision was already made) —
 * the real `EmployerProfile.VerificationStatus` choices, not invented
 * ones. */
export function Unauthorized() {
  const { t } = useTranslation()
  const location = useLocation()
  const state = location.state as { reason?: Reason; status?: EmployerVerificationStatus } | null

  const body =
    state?.reason === 'unverified-employer'
      ? state.status === 'REJECTED'
        ? t('unauthorized.rejectedEmployer')
        : t('unauthorized.unverifiedEmployer')
      : t('unauthorized.genericBody')

  return (
    <PageContainer>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">{t('unauthorized.title')}</h1>
        <p className="max-w-md text-base text-text-secondary">{body}</p>
        <Link to="/">
          <Button variant="primary">{t('common.backHome')}</Button>
        </Link>
      </div>
    </PageContainer>
  )
}

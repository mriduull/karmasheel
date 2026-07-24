import { Outlet } from 'react-router-dom'
import { Briefcase, Home, Plus, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'
import { NavShell, type NavItem } from './NavShell'

/**
 * Home · My Jobs · Profile, plus "Post a Job" only once verification
 * status resolves to VERIFIED (never shown while loading/pending/
 * rejected/errored — an unverified Employer reaches the explanation via
 * My Jobs/Dashboard instead, not via a nav item that would 403). Per
 * docs/FRONTEND_IMPLEMENTATION_PLAN.md correction #4, there is
 * deliberately no employer-wide "Applicants" nav item: no endpoint
 * aggregates applications across jobs (only
 * `GET /api/jobs/<job_id>/applications/`, scoped to one job), so "My
 * Jobs" is the only entry point — the applications screen (Phase F3) is
 * reached only via a specific job.
 */
export function EmployerLayout() {
  const { t } = useTranslation()
  const { status } = useEmployerVerificationStatus()

  const items: NavItem[] = [
    { to: '/employer', label: t('nav.employer.dashboard'), icon: Home },
    { to: '/employer/jobs', label: t('nav.employer.myJobs'), icon: Briefcase },
    { to: '/employer/profile', label: t('nav.employer.profile'), icon: User },
  ]

  if (status === 'VERIFIED') {
    items.push({ to: '/employer/jobs/new', label: t('nav.employer.postAJob'), icon: Plus })
  }

  return (
    <NavShell items={items} brandHref="/employer">
      <Outlet />
    </NavShell>
  )
}

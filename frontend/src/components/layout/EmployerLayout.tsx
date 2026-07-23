import { Outlet } from 'react-router-dom'
import { Briefcase, Home, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavShell, type NavItem } from './NavShell'

/**
 * Three items only — Home · My Jobs · Profile. Per
 * docs/FRONTEND_IMPLEMENTATION_PLAN.md correction #4, there is
 * deliberately no employer-wide "Applicants" nav item: no endpoint
 * aggregates applications across jobs (only
 * `GET /api/jobs/<job_id>/applications/`, scoped to one job), so "My
 * Jobs" is the only entry point — the applications screen (Phase F3) is
 * reached only via a specific job.
 */
export function EmployerLayout() {
  const { t } = useTranslation()

  const items: NavItem[] = [
    { to: '/employer', label: t('nav.employer.dashboard'), icon: Home },
    { to: '/employer/jobs', label: t('nav.employer.myJobs'), icon: Briefcase },
    { to: '/employer/profile', label: t('nav.employer.profile'), icon: User },
  ]

  return (
    <NavShell items={items} brandHref="/employer">
      <Outlet />
    </NavShell>
  )
}

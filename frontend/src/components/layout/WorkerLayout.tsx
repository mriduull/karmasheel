import { Outlet } from 'react-router-dom'
import { Briefcase, ClipboardList, Home, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavShell, type NavItem } from './NavShell'

export function WorkerLayout() {
  const { t } = useTranslation()

  const items: NavItem[] = [
    { to: '/worker', label: t('nav.worker.dashboard'), icon: Home },
    { to: '/jobs', label: t('nav.browseJobs'), icon: Briefcase },
    { to: '/worker/applications', label: t('nav.worker.applications'), icon: ClipboardList },
    { to: '/worker/profile', label: t('nav.worker.profile'), icon: User },
  ]

  return (
    <NavShell items={items} brandHref="/worker">
      <Outlet />
    </NavShell>
  )
}

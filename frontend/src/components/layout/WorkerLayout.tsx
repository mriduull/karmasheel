import { Outlet } from 'react-router-dom'
import { Briefcase, ClipboardList, FileText, Home, Lightbulb, Star, TrendingUp, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavShell, type NavItem } from './NavShell'

export function WorkerLayout() {
  const { t } = useTranslation()

  const items: NavItem[] = [
    { to: '/worker', label: t('nav.worker.dashboard'), icon: Home },
    { to: '/jobs', label: t('nav.browseJobs'), icon: Briefcase },
    { to: '/worker/applications', label: t('nav.worker.applications'), icon: ClipboardList },
    { to: '/worker/recommendations', label: t('nav.worker.recommendations'), icon: TrendingUp },
    { to: '/worker/opportunities', label: t('nav.worker.opportunities'), icon: Lightbulb },
    { to: '/worker/profile', label: t('nav.worker.profile'), icon: User },
    { to: '/worker/cv', label: t('nav.worker.cv'), icon: FileText },
    { to: '/worker/ratings', label: t('nav.worker.ratings'), icon: Star },
  ]

  return (
    <NavShell items={items} brandHref="/worker">
      <Outlet />
    </NavShell>
  )
}

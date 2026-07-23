import { Outlet } from 'react-router-dom'
import { Briefcase, LogIn, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavShell, type NavItem } from './NavShell'

export function PublicLayout() {
  const { t } = useTranslation()

  const items: NavItem[] = [
    { to: '/jobs', label: t('nav.browseJobs'), icon: Briefcase },
    { to: '/login', label: t('nav.login'), icon: LogIn },
    { to: '/register', label: t('nav.register'), icon: UserPlus },
  ]

  return (
    <NavShell items={items} brandHref="/">
      <Outlet />
    </NavShell>
  )
}

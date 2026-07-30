import { Outlet } from 'react-router-dom'
import { Briefcase, Home, LogIn, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/state/authStore'
import { NavShell, type NavItem } from './NavShell'

/**
 * Public routes (`/`, `/jobs`, `/jobs/:id`) are reachable by anyone,
 * signed in or not — a Worker or Employer can land here (e.g. via a
 * shared job link) without leaving their authenticated session. Fixes
 * the F1 issue where an already-authenticated user saw "Log In"/
 * "Register" alongside their own username + Logout in `NavShell`
 * (`NavShell` renders the identity/logout block whenever `user` is
 * truthy, independent of the `items` passed in): the nav items
 * themselves must also stop offering Login/Register once signed in,
 * replaced by a single role-appropriate link back to that user's own
 * dashboard. Unauthenticated nav is untouched.
 */
export function PublicLayout() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)

  const items: NavItem[] = user
    ? [
        { to: '/jobs', label: t('nav.browseJobs'), icon: Briefcase },
        {
          to: user.role === 'WORKER' ? '/worker' : '/employer',
          label: t('nav.dashboard'),
          icon: Home,
        },
      ]
    : [
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

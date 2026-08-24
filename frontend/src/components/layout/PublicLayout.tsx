import { Outlet, useLocation } from 'react-router-dom'
import {
  Briefcase,
  ClipboardList,
  FileText,
  Home,
  Lightbulb,
  LogIn,
  Star,
  TrendingUp,
  User,
  UserPlus,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/state/authStore'
import { NavShell, type NavItem } from './NavShell'

/**
 * Public routes are reachable by anyone. Authenticated Workers should keep
 * the same header they see on Home while browsing jobs from that dashboard.
 */
export function PublicLayout() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  // The reference-style marketing header belongs to the landing page
  // itself only — every other public route (job browse/detail, login,
  // register) and every authenticated dashboard keep today's calmer
  // header, so header continuity is preserved everywhere except `/`.
  const navVariant = location.pathname === '/' ? 'public' : 'app'

  let brandHref = '/'
  let items: NavItem[]

  if (user?.role === 'WORKER') {
    brandHref = '/worker'
    items = [
      { to: '/worker', label: t('nav.worker.dashboard'), icon: Home },
      { to: '/jobs', label: t('nav.browseJobs'), icon: Briefcase },
      { to: '/worker/applications', label: t('nav.worker.applications'), icon: ClipboardList },
      { to: '/worker/recommendations', label: t('nav.worker.recommendations'), icon: TrendingUp },
      { to: '/worker/opportunities', label: t('nav.worker.opportunities'), icon: Lightbulb },
      { to: '/worker/profile', label: t('nav.worker.profile'), icon: User },
      { to: '/worker/cv', label: t('nav.worker.cv'), icon: FileText },
      { to: '/worker/ratings', label: t('nav.worker.ratings'), icon: Star },
    ]
  } else if (user?.role === 'EMPLOYER') {
    brandHref = '/employer'
    items = [
      { to: '/jobs', label: t('nav.browseJobs'), icon: Briefcase },
      { to: '/employer', label: t('nav.dashboard'), icon: Home },
    ]
  } else {
    items = [
      { to: '/jobs', label: t('nav.browseJobs'), icon: Briefcase },
      { to: '/login', label: t('nav.login'), icon: LogIn },
      { to: '/register', label: t('nav.register'), icon: UserPlus },
    ]
  }

  return (
    <NavShell items={items} brandHref={brandHref} variant={navVariant}>
      <Outlet />
    </NavShell>
  )
}

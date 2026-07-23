import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/state/authStore'
import { logoutRequest } from '@/api/endpoints/auth'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

interface NavShellProps {
  items: NavItem[]
  brandHref: string
  children: ReactNode
}

/** How many items stay directly visible on the tablet top bar before the
 * rest collapse into the "More" menu (design spec §3.3). */
const TABLET_VISIBLE_ITEMS = 3
/** Bottom tab bar shows at most 5 items on mobile (design spec §3.4). */
const MOBILE_TAB_ITEMS = 5

/**
 * Role-aware navigation shell: a full top bar on desktop (≥1024px), a
 * "first few items + More" top bar on tablet (768–1023px), and a bottom
 * tab bar on mobile (<768px). Every item is icon + text, always — no
 * icon-only navigation anywhere, per the design spec's explicit requirement.
 */
export function NavShell({ items, brandHref, children }: NavShellProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [isMoreOpen, setMoreOpen] = useState(false)

  const tabletPrimaryItems = items.slice(0, TABLET_VISIBLE_ITEMS)
  const tabletOverflowItems = items.slice(TABLET_VISIBLE_ITEMS)
  const mobileItems = items.slice(0, MOBILE_TAB_ITEMS)

  const handleLogout = async () => {
    // Best-effort server-side blacklist — logoutRequest() never throws
    // (see its own try/catch), so an already-expired session is handled
    // safely here too: local state is cleared and the redirect happens
    // regardless of whether the API call succeeded.
    await logoutRequest()
    useAuthStore.getState().logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="border-b border-text-secondary/10 bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to={brandHref} className="shrink-0 text-lg font-semibold text-brand-primary">
            {t('brand.name')}
          </Link>

          {/* A single top-bar landmark — which item set is visible switches
              with the breakpoint on inner wrapper divs, not on the <nav>
              itself, so exactly one "Primary" landmark ever exists in the
              DOM (multiple <nav aria-label="Primary"> elements at once is
              an accessibility-tree violation even when only one is
              visually shown). */}
          <nav aria-label="Primary" className="flex items-center gap-1">
            {/* Desktop: every item, icon + text. */}
            <div className="hidden items-center gap-1 lg:flex">
              {items.map((item) => (
                <NavLinkItem key={item.to} item={item} />
              ))}
            </div>

            {/* Tablet: first few items directly visible + a labeled "More" menu. */}
            <div className="hidden items-center gap-1 md:flex lg:hidden">
              {tabletPrimaryItems.map((item) => (
                <NavLinkItem key={item.to} item={item} />
              ))}
              {tabletOverflowItems.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    className="inline-flex min-h-touch items-center gap-1 rounded-sm px-3 text-base font-semibold text-text-primary hover:bg-surface-muted"
                    aria-expanded={isMoreOpen}
                    aria-haspopup="true"
                    onClick={() => setMoreOpen((open) => !open)}
                  >
                    {t('nav.more')}
                  </button>
                  {isMoreOpen && (
                    <div className="absolute right-0 z-10 mt-1 flex w-48 flex-col gap-1 rounded-md border border-text-secondary/10 bg-surface p-2 shadow-float">
                      {tabletOverflowItems.map((item) => (
                        <NavLinkItem key={item.to} item={item} onClick={() => setMoreOpen(false)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </nav>

          {user && (
            <div className="hidden shrink-0 items-center gap-3 md:flex">
              <span className="text-sm text-text-secondary">
                {user.username} · {user.role === 'WORKER' ? 'Worker' : 'Employer'}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-touch items-center gap-1 rounded-sm px-3 text-base font-semibold text-text-primary hover:bg-surface-muted"
              >
                <LogOut size={20} aria-hidden="true" />
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile: bottom tab bar, icon above label, ≥44px targets. Labeled
          distinctly from the top-bar "Primary" landmark above — both can
          exist in the DOM at once (only one is visually shown per
          breakpoint), so they must never share the same landmark name. */}
      <nav
        aria-label={t('nav.bottomNavigation')}
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-text-secondary/10 bg-surface md:hidden"
      >
        {mobileItems.map((item) => (
          <BottomTabItem key={item.to} item={item} />
        ))}
      </nav>
    </div>
  )
}

function NavLinkItem({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        `inline-flex min-h-touch items-center gap-2 rounded-sm px-3 text-base font-semibold ${
          isActive ? 'bg-surface-muted text-brand-primary' : 'text-text-primary hover:bg-surface-muted'
        }`
      }
    >
      <Icon size={20} aria-hidden="true" />
      {item.label}
    </NavLink>
  )
}

function BottomTabItem({ item }: { item: NavItem }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-semibold ${
          isActive ? 'text-brand-primary' : 'text-text-secondary'
        }`
      }
    >
      <Icon size={22} aria-hidden="true" />
      {item.label}
    </NavLink>
  )
}

import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
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
  /**
   * `'app'` (default) — today's header, used by the Worker/Employer
   * dashboards and every public route except the landing page itself.
   * `'public'` — a visually taller, more expressive marketing-header
   * treatment for `/` only (Karmasheel Design Constitution §40 — the
   * public site may be more visually expressive than the calmer product
   * application). Presentation only: same `<nav aria-label="Primary">`
   * landmark, same items, same breakpoint/overflow/logout behavior.
   */
  variant?: 'app' | 'public'
}

/** How many items stay directly visible on the tablet top bar before the
 * rest collapse into the "More" menu (design spec §3.3). */
const TABLET_VISIBLE_ITEMS = 2
const COMPACT_DESKTOP_VISIBLE_ITEMS = 5
/** Bottom tab bar shows at most 5 items on mobile (design spec §3.4). */
const MOBILE_TAB_ITEMS = 5

/**
 * Role-aware navigation shell: a full top bar on wide desktop (≥1536px),
 * progressively compacted "items + More" bars from 768–1535px, and a bottom
 * tab bar on mobile (<768px). Every item is icon + text, always — no
 * icon-only navigation anywhere, per the design spec's explicit requirement.
 */
export function NavShell({ items, brandHref, children, variant = 'app' }: NavShellProps) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const user = useAuthStore((state) => state.user)
  const [isMoreOpen, setMoreOpen] = useState(false)
  const displayName = user?.full_name || user?.username

  const tabletPrimaryItems = visibleItemsIncludingCurrent(items, TABLET_VISIBLE_ITEMS, pathname)
  const tabletPrimaryPaths = new Set(tabletPrimaryItems.map((item) => item.to))
  const tabletOverflowItems = items.filter((item) => !tabletPrimaryPaths.has(item.to))
  const compactDesktopPrimaryItems = visibleItemsIncludingCurrent(
    items,
    COMPACT_DESKTOP_VISIBLE_ITEMS,
    pathname,
  )
  const compactDesktopPrimaryPaths = new Set(compactDesktopPrimaryItems.map((item) => item.to))
  const compactDesktopOverflowItems = items.filter(
    (item) => !compactDesktopPrimaryPaths.has(item.to),
  )
  const mobileItems = items.slice(0, MOBILE_TAB_ITEMS)

  const handleLogout = async () => {
    // Best-effort server-side blacklist — logoutRequest() never throws
    // (see its own try/catch), so an already-expired session is handled
    // safely here too: local state is cleared and the redirect happens
    // regardless of whether the API call succeeded.
    await logoutRequest()
    useAuthStore.getState().logout()
    // A full page load, not client-side navigate(), and deliberately so:
    // the current route is very likely still a Worker/Employer-guarded
    // one, whose guard (RequireAuth/RequireRole) is reactively watching
    // `user` and would redirect to /login the instant it goes null,
    // regardless of call order — React Router's data-router navigation
    // resolves via a concurrent transition that neither synchronous
    // reordering nor flushSync can force to commit ahead of that reactive
    // redirect (verified empirically, not assumed). A hard navigation
    // sidesteps the race entirely and, as a bonus, guarantees every
    // in-memory value (not just the query cache) is wiped, not just
    // whatever this SPA's state management happens to track.
    window.location.assign('/')
  }

  const isPublicVariant = variant === 'public'

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header
        className={
          isPublicVariant
            ? 'border-b border-text-secondary/10 bg-bg'
            : 'border-b border-text-secondary/10 bg-surface'
        }
      >
        <div
          className={`flex items-center ${
            isPublicVariant
              ? 'mx-auto max-w-6xl justify-between gap-4 px-4 sm:px-6 lg:px-8'
              : 'w-full max-w-none gap-2 px-3 sm:px-4 xl:px-5'
          } ${isPublicVariant ? 'h-20' : 'h-16'}`}
        >
          <Link
            to={brandHref}
            className={
              isPublicVariant
                ? 'shrink-0 font-display text-xl font-bold text-brand-primary'
                : 'shrink-0 whitespace-nowrap text-base font-semibold text-brand-primary'
            }
          >
            {t('brand.name')}
          </Link>

          {/* A single top-bar landmark — which item set is visible switches
              with the breakpoint on inner wrapper divs, not on the <nav>
              itself, so exactly one "Primary" landmark ever exists in the
              DOM (multiple <nav aria-label="Primary"> elements at once is
              an accessibility-tree violation even when only one is
              visually shown). */}
          <nav
            aria-label="Primary"
            className={`flex min-w-0 items-center gap-1 ${isPublicVariant ? '' : 'flex-1 justify-center'}`}
          >
            {/* Wide desktop: every item, icon + text. */}
            <div className="hidden min-w-0 items-center gap-0.5 2xl:flex">
              {items.map((item) => (
                <NavLinkItem
                  key={item.to}
                  item={item}
                  pill={isPublicVariant}
                  compact={!isPublicVariant}
                />
              ))}
            </div>

            {/* Medium desktop: use the available width without allowing the
                final links to collide with the account controls. */}
            <div className="hidden items-center gap-1 xl:flex 2xl:hidden">
              {compactDesktopPrimaryItems.map((item) => (
                <NavLinkItem
                  key={item.to}
                  item={item}
                  pill={isPublicVariant}
                  compact={!isPublicVariant}
                />
              ))}
              <NavMoreMenu
                items={compactDesktopOverflowItems}
                isOpen={isMoreOpen}
                setOpen={setMoreOpen}
                compact={!isPublicVariant}
              />
            </div>

            {/* Tablet/small desktop: first two items + a labeled "More" menu. */}
            <div className="hidden items-center gap-1 md:flex xl:hidden">
              {tabletPrimaryItems.map((item) => (
                <NavLinkItem
                  key={item.to}
                  item={item}
                  pill={isPublicVariant}
                  compact={!isPublicVariant}
                />
              ))}
              <NavMoreMenu
                items={tabletOverflowItems}
                isOpen={isMoreOpen}
                setOpen={setMoreOpen}
                compact={!isPublicVariant}
              />
            </div>
          </nav>

          {user && (
            <div className="hidden shrink-0 items-center gap-3 md:flex">
              <span className="max-w-64 truncate text-sm text-text-secondary" title={displayName}>
                {displayName} · {user.role === 'WORKER' ? 'Worker' : 'Employer'}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex min-h-touch shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-sm font-semibold text-text-primary hover:bg-surface-muted xl:px-2"
              >
                <LogOut size={18} aria-hidden="true" />
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

function visibleItemsIncludingCurrent(items: NavItem[], limit: number, pathname: string): NavItem[] {
  const primary = items.slice(0, limit)
  const current = items.find((item) =>
    pathname === item.to ||
    (item.to !== '/worker' &&
      item.to !== '/employer' &&
      pathname.startsWith(`${item.to}/`)),
  )

  if (!current || primary.some((item) => item.to === current.to)) return primary
  return [...primary.slice(0, Math.max(0, limit - 1)), current]
}

function NavMoreMenu({
  items,
  isOpen,
  setOpen,
  compact,
}: {
  items: NavItem[]
  isOpen: boolean
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void
  compact: boolean
}) {
  const { t } = useTranslation()

  if (items.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        className={`inline-flex min-h-touch items-center gap-1 rounded-sm font-semibold text-text-primary hover:bg-surface-muted ${
          compact ? 'px-2 text-sm' : 'px-3 text-base'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setOpen((open) => !open)}
      >
        {t('nav.more')}
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col gap-1 rounded-md border border-text-secondary/10 bg-surface p-2 shadow-float">
          {items.map((item) => (
            <NavLinkItem key={item.to} item={item} onClick={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  )
}

function NavLinkItem({
  item,
  onClick,
  pill = false,
  compact = false,
}: {
  item: NavItem
  onClick?: () => void
  pill?: boolean
  compact?: boolean
}) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        `inline-flex min-h-touch items-center whitespace-nowrap font-semibold ${
          compact ? 'gap-1 px-1.5 text-xs xl:px-2' : 'gap-2 px-3 text-base'
        } ${
          pill ? 'rounded-full px-4' : 'rounded-sm'
        } ${isActive ? 'bg-surface-muted text-brand-primary' : 'text-text-primary hover:bg-surface-muted'}`
      }
    >
      <Icon size={compact ? 18 : 20} aria-hidden="true" />
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

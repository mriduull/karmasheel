import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Landing-page footer (design spec §4) — plain links only, no nested
 * `<nav>` landmark (avoids any risk of a duplicate-landmark conflict with
 * the header's own "Primary" nav). */
export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-text-secondary/10 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>{t('brand.name')} — connecting local workers and employers.</p>
        <div className="flex gap-4">
          <Link to="/login" className="font-semibold text-text-primary hover:underline">
            {t('nav.login')}
          </Link>
          <Link to="/register" className="font-semibold text-text-primary hover:underline">
            {t('nav.register')}
          </Link>
        </div>
      </div>
    </footer>
  )
}

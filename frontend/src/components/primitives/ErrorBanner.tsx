import { useTranslation } from 'react-i18next'
import { Button } from './Button'

interface ErrorBannerProps {
  message: string
  onRetry?: () => void
}

/** Renders an already-translated message (see src/api/errors.ts) in a
 * consistent, visually distinct banner — never raw JSON or a stack trace. */
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  const { t } = useTranslation()

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-danger-text/20 bg-danger-bg px-4 py-3 text-danger-text sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-base">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="shrink-0">
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

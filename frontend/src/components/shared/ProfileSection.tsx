import type { FormEvent, ReactNode } from 'react'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'

interface ProfileSectionProps {
  title: string
  description?: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isSubmitting: boolean
  isSaved: boolean
  error: string | null
  children: ReactNode
}

/** Shared shell for each independently-PATCHable profile section — one
 * `<form>`, one Save button, one inline "Saved" confirmation, one error
 * slot. Every Worker Profile section (Basics, Location, Skills,
 * Availability & Wage) renders through this so the pattern stays
 * identical across all four. */
export function ProfileSection({
  title,
  description,
  onSubmit,
  isSubmitting,
  isSaved,
  error,
  children,
}: ProfileSectionProps) {
  return (
    <section className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}

      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        {children}

        {error && <ErrorBanner message={error} />}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Save
          </Button>
          {isSaved && (
            <span role="status" className="text-sm font-semibold text-success-text">
              Saved
            </span>
          )}
        </div>
      </form>
    </section>
  )
}

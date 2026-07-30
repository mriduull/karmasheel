import type { ReactNode } from 'react'

interface JobFormSectionProps {
  title: string
  description?: string
  children: ReactNode
}

/**
 * Plain visual grouping only — unlike `ProfileSection` (F2), this is NOT
 * independently submitted: `POST /api/jobs/` has no concept of partial
 * creation, so the whole job form is one combined submit even though it
 * reads as separate Basics/Location/Terms/Skills sections.
 */
export function JobFormSection({ title, description, children }: JobFormSectionProps) {
  return (
    <section className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

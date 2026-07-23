import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

/** Always a specific, supportive sentence — never a bare "No data" or blank space. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-text-secondary/30 bg-surface px-6 py-10 text-center">
      <p className="text-lg font-semibold text-text-primary">{title}</p>
      {description && <p className="text-base text-text-secondary">{description}</p>}
      {action}
    </div>
  )
}

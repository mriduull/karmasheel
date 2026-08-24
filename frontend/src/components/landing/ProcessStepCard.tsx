import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

interface ProcessStepCardProps {
  step: number
  icon: LucideIcon
  title: string
  body: string
  linkTo: string
  linkLabel: string
}

/** One card in the landing page's "How it works" process section — icon
 * circle, title, body, and a single supporting link, matching the
 * reference's 3-step process-card composition. */
export function ProcessStepCard({ step, icon: Icon, title, body, linkTo, linkLabel }: ProcessStepCardProps) {
  return (
    <div className="flex flex-1 flex-col items-start gap-3 rounded-md border border-text-secondary/10 bg-surface p-6 shadow-card">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-brand-primary bg-surface-muted text-brand-primary"
        aria-hidden="true"
      >
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Step {step}</p>
      <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
      <p className="text-base text-text-secondary">{body}</p>
      <Link to={linkTo} className="text-sm font-semibold text-brand-primary hover:underline">
        {linkLabel}
      </Link>
    </div>
  )
}

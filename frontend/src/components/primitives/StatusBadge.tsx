import type { ReactNode } from 'react'

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger-text',
  neutral: 'bg-neutral-status-bg text-neutral-status-text',
}

interface StatusBadgeProps {
  tone: Tone
  children: ReactNode
}

/**
 * Foundation for the 8-status application palette and other status
 * displays (design spec §10) — feature phases supply the tone/label
 * mapping (e.g. `APPLIED` -> neutral, `HIRED` -> success). Status colors
 * are never reused for anything decorative.
 */
export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-1 text-sm font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}

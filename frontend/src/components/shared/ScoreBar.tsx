interface ScoreBarProps {
  label: string
  /** `null` renders "Unknown" text instead of a 0% bar — a missing
   * distance score must never be displayed as if it were a real zero. */
  score: number | null
}

/** One labeled 0–100 score as a short horizontal bar — never the backend's
 * raw field name or formula, just a plain label and the number (design
 * spec §11: "Skills," "Distance," "Experience," "Availability & wage fit,"
 * "Trust & reliability"). */
export function ScoreBar({ label, score }: ScoreBarProps) {
  if (score === null) {
    return (
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-primary">{label}</span>
          <span className="text-text-secondary">Unknown</span>
        </div>
      </div>
    )
  }

  const clamped = Math.min(100, Math.max(0, score))

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-secondary">{Math.round(clamped)}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full bg-surface-muted">
        <div
          className="h-2 rounded-full bg-brand-secondary"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

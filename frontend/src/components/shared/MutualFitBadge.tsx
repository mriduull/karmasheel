interface MutualFitBadgeProps {
  score: number
}

/** `reciprocal_preference_score` — explanatory only, NEVER part of
 * `final_score` and never presented as a second ranking number
 * (recommendations/services.py's own explicit note). Always labeled
 * "Mutual fit" and visually separated from the ranking score bars. */
export function MutualFitBadge({ score }: MutualFitBadgeProps) {
  return (
    <div className="rounded-md bg-surface-muted px-3 py-2">
      <p className="text-sm font-semibold text-text-primary">Mutual fit: {Math.round(score)}</p>
      <p className="text-xs text-text-secondary">
        How well this suits both sides — not part of the match score above.
      </p>
    </div>
  )
}

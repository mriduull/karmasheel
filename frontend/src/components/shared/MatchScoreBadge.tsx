interface MatchScoreBadgeProps {
  score: number
}

/** `final_score` shown as a simple labeled number ("92 out of 100 match"),
 * never a raw decimal (design spec §11). */
export function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-md bg-surface-muted px-3 py-2 text-center">
      <span className="text-2xl font-semibold text-brand-primary">{Math.round(score)}</span>
      <span className="text-xs text-text-secondary">out of 100 match</span>
    </div>
  )
}

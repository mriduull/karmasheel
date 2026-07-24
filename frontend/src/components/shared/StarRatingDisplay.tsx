import { Star } from 'lucide-react'

interface StarRatingDisplayProps {
  /** 0–5, e.g. `average_rating` or a single `Rating.score`. */
  score: number
}

/** Read-only 1–5 star visual — color is never the only signal (paired with
 * an accessible label stating the numeric score). */
export function StarRatingDisplay({ score }: StarRatingDisplayProps) {
  const rounded = Math.round(score)

  return (
    <div
      role="img"
      aria-label={`${score.toFixed(1)} out of 5 stars`}
      className="flex items-center gap-0.5 text-warning-text"
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={18}
          aria-hidden="true"
          fill={value <= rounded ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  )
}

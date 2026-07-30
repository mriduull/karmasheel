import { StarRatingDisplay } from './StarRatingDisplay'
import { EmptyState } from '@/components/primitives/EmptyState'
import type { RatingSummary } from '@/types/rating'

interface RatingSummaryCardProps {
  summary: RatingSummary
}

/** `average_rating: null` / `rating_count: 0` is a real, legitimate
 * cold-start state — never invented as `0.0` (design spec §14/§20). */
export function RatingSummaryCard({ summary }: RatingSummaryCardProps) {
  if (summary.rating_count === 0 || summary.average_rating === null) {
    return (
      <EmptyState
        title="No ratings yet"
        description="Complete a job to start building your rating."
      />
    )
  }

  return (
    <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
      <p className="text-3xl font-semibold text-text-primary">{summary.average_rating.toFixed(1)}</p>
      <StarRatingDisplay score={summary.average_rating} />
      <p className="mt-1 text-sm text-text-secondary">
        {summary.rating_count} rating{summary.rating_count === 1 ? '' : 's'}
      </p>
    </div>
  )
}

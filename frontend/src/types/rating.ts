export type RatingDirection = 'WORKER_TO_EMPLOYER' | 'EMPLOYER_TO_WORKER'

/** applications/serializers.py:RatingSerializer — response shape from both
 * `GET` and `POST /api/applications/<id>/rating/`. `direction`/
 * `reviewer_username`/`reviewed_username` are always derived server-side
 * from which participant is authenticated — never client input. */
export interface Rating {
  id: number
  application: number
  direction: RatingDirection
  reviewer_username: string
  reviewed_username: string
  score: number
  review_text: string
  created_at: string
}

/** applications/serializers.py:RatingCreateSerializer — the only writable
 * fields. `direction` is never sent; the backend derives it from which side
 * of the application the authenticated user is on. */
export interface RatingCreatePayload {
  score: number
  review_text?: string
}

/** applications/serializers.py:RatingSummarySerializer, returned by
 * GET /api/applications/ratings/summary/ — the authenticated user's own
 * aggregate, as the party being rated. */
export interface RatingSummary {
  average_rating: number | null
  rating_count: number
}

import { useCallback, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { submitApplicationRating } from '@/api/endpoints/applications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { applicationRatingQueryKey } from '@/hooks/useApplicationRating'
import { RATING_SUMMARY_QUERY_KEY } from '@/hooks/useRatingSummary'
import { ConfirmDialog } from '@/components/primitives/ConfirmDialog'
import type { Application } from '@/types/application'

interface RatingFormDialogProps {
  isOpen: boolean
  application: Application
  viewerRole: 'WORKER' | 'EMPLOYER'
  onClose: () => void
}

/**
 * Score (1–5, required) + optional review text (≤1000 chars, matching
 * `RatingCreateSerializer`) — reuses `ConfirmDialog`'s accessible modal
 * chrome (focus trap, Escape-to-close, labeled dialog) via its
 * `description` slot rather than re-implementing that behavior.
 * `direction`/`reviewer`/`reviewed_user` are never sent — the backend
 * derives them from the authenticated participant
 * (applications/services.py:submit_rating).
 */
export function RatingFormDialog({ isOpen, application, viewerRole, onClose }: RatingFormDialogProps) {
  const queryClient = useQueryClient()
  const [score, setScore] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () =>
      submitApplicationRating(application.id, {
        score,
        review_text: reviewText.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationRatingQueryKey(application.id) })
      queryClient.invalidateQueries({ queryKey: RATING_SUMMARY_QUERY_KEY })
      setError(null)
      setReviewText('')
      setScore(5)
      onClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? toBannerMessage(err) : 'Something went wrong — please try again.')
    },
  })

  // Stable across re-renders (score/reviewText keystrokes) — ConfirmDialog's
  // own focus-management effect depends on `onCancel`'s identity, so an
  // inline arrow function recreated every render would re-run that effect
  // (and re-steal focus from the textarea) on every keystroke. `mutation`
  // itself is a new object every render (TanStack Query), so it's read
  // through a ref rather than closed over directly, keeping `handleConfirm`
  // fully stable (empty dependency array) while still calling the latest
  // mutation.
  const mutationRef = useRef(mutation)
  mutationRef.current = mutation

  const handleConfirm = useCallback(() => {
    mutationRef.current.mutate()
  }, [])

  const handleCancel = useCallback(() => {
    setError(null)
    onClose()
  }, [onClose])

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={viewerRole === 'WORKER' ? 'Rate this employer' : 'Rate this worker'}
      description={
        <div className="flex flex-col gap-3 text-left">
          <div>
            <span className="mb-1 block text-sm font-semibold text-text-primary">Score</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  aria-pressed={score === value}
                  onClick={() => setScore(value)}
                  className={`flex min-h-touch min-w-touch items-center justify-center rounded-sm border ${
                    score >= value
                      ? 'border-warning-text bg-warning-bg'
                      : 'border-text-secondary/30 bg-surface'
                  }`}
                >
                  <Star
                    size={20}
                    aria-hidden="true"
                    fill={score >= value ? 'currentColor' : 'none'}
                    className="text-warning-text"
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="rating-review-text" className="mb-1 block text-sm font-semibold text-text-primary">
              Review (optional)
            </label>
            <textarea
              id="rating-review-text"
              value={reviewText}
              maxLength={1000}
              rows={3}
              onChange={(event) => setReviewText(event.target.value)}
              className="w-full rounded-sm border border-text-secondary/30 bg-surface px-3 py-2 text-base text-text-primary focus:border-brand-primary"
            />
          </div>
        </div>
      }
      confirmLabel="Submit rating"
      cancelLabel="Cancel"
      confirmVariant="primary"
      isConfirming={mutation.isPending}
      error={error}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )
}

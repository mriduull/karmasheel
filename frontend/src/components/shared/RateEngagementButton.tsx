import { useState } from 'react'
import { useApplicationRating } from '@/hooks/useApplicationRating'
import { Button } from '@/components/primitives/Button'
import { SkeletonBlock } from '@/components/primitives/SkeletonBlock'
import { StarRatingDisplay } from './StarRatingDisplay'
import { RatingFormDialog } from './RatingFormDialog'
import type { Application } from '@/types/application'

interface RateEngagementButtonProps {
  application: Application
  viewerRole: 'WORKER' | 'EMPLOYER'
}

/**
 * Renders nothing at all unless `status === 'COMPLETED'`
 * (applications/services.py:submit_rating's own guard) — placed inline on
 * each completed application row (ApplicationCard for a Worker,
 * ApplicantCard for an Employer), per
 * docs/FRONTEND_IMPLEMENTATION_PLAN.md's Phase F4 correction #3: there is
 * no separate "submit a rating" screen, only this inline action plus the
 * read-only aggregate on the Ratings screens. Checks for an existing
 * rating in the viewer's own direction via `GET /api/applications/<id>/rating/`
 * before ever offering the button, so a duplicate submission is prevented
 * client-side (the backend rejects it either way).
 */
export function RateEngagementButton({ application, viewerRole }: RateEngagementButtonProps) {
  const enabled = application.status === 'COMPLETED'
  const ratingsQuery = useApplicationRating(application.id, { enabled })
  const [isDialogOpen, setDialogOpen] = useState(false)

  if (!enabled) return null
  if (ratingsQuery.isLoading) return <SkeletonBlock className="h-8 w-36" />
  // Non-critical for the row as a whole — a failed rating check should
  // never block the rest of the application card from rendering.
  if (ratingsQuery.isError) return null

  const direction = viewerRole === 'WORKER' ? 'WORKER_TO_EMPLOYER' : 'EMPLOYER_TO_WORKER'
  const existing = ratingsQuery.data?.find((rating) => rating.direction === direction)

  if (existing) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <StarRatingDisplay score={existing.score} />
        {existing.review_text && (
          <p className="max-w-xs text-sm italic text-text-secondary">"{existing.review_text}"</p>
        )}
      </div>
    )
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        {viewerRole === 'WORKER' ? 'Rate this employer' : 'Rate this worker'}
      </Button>
      <RatingFormDialog
        isOpen={isDialogOpen}
        application={application}
        viewerRole={viewerRole}
        onClose={() => setDialogOpen(false)}
      />
    </>
  )
}

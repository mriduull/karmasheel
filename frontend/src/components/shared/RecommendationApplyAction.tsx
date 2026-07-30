import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createApplication } from '@/api/endpoints/applications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { useMyApplications, MY_APPLICATIONS_QUERY_KEY } from '@/hooks/useMyApplications'
import { Button } from '@/components/primitives/Button'
import { SkeletonBlock } from '@/components/primitives/SkeletonBlock'
import { ApplicationStatusChip } from './ApplicationStatusChip'
import type { JobStatus } from '@/types/job'

interface RecommendationApplyActionProps {
  job: { id: number; status: JobStatus }
}

/**
 * The Apply action for a recommendation card — the same
 * `POST /api/applications/` flow and `["applications", "mine"]` cache as
 * `ApplyPanel.tsx` (Phase F2's Job Detail Apply flow), adapted to the
 * smaller `RecommendedJobSummary` shape (id + status only, no full
 * `PublicJobPost`) that the recommendation endpoints actually return.
 * Deliberately reuses `useMyApplications`/`createApplication` rather than a
 * separate mutation, so "already applied" is derived from the same source
 * of truth as My Applications and Job Detail, never a second copy.
 */
export function RecommendationApplyAction({ job }: RecommendationApplyActionProps) {
  const queryClient = useQueryClient()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [justApplied, setJustApplied] = useState(false)

  const applicationsQuery = useMyApplications()

  const applyMutation = useMutation({
    mutationFn: () => createApplication({ job: job.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_QUERY_KEY })
      setSubmitError(null)
      setJustApplied(true)
    },
    onError: (error: unknown) => {
      queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_QUERY_KEY })
      if (error instanceof ApiError) {
        setSubmitError(error.fieldErrors?.job?.join(' ') ?? toBannerMessage(error))
        return
      }
      setSubmitError('Something went wrong — please try again.')
    },
  })

  if (job.status !== 'ACTIVE') {
    return <p className="text-sm text-text-secondary">This job is no longer accepting applications.</p>
  }

  if (applicationsQuery.isLoading) {
    return <SkeletonBlock className="h-10 w-28" />
  }

  const existingApplication = applicationsQuery.data?.find((application) => application.job === job.id)

  if (existingApplication) {
    return <ApplicationStatusChip status={existingApplication.status} />
  }

  if (justApplied) {
    return <span className="text-sm font-semibold text-success-text">Application sent.</span>
  }

  return (
    <div className="flex flex-col gap-1">
      {submitError && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {submitError}
        </p>
      )}
      <Button variant="primary" onClick={() => applyMutation.mutate()} isLoading={applyMutation.isPending}>
        Apply
      </Button>
    </div>
  )
}

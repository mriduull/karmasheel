import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createApplication } from '@/api/endpoints/applications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { useAuthStore } from '@/state/authStore'
import { useMyApplications, MY_APPLICATIONS_QUERY_KEY } from '@/hooks/useMyApplications'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { SkeletonBlock } from '@/components/primitives/SkeletonBlock'
import { ApplicationStatusChip } from './ApplicationStatusChip'
import type { PublicJobPost } from '@/types/job'

interface ApplyPanelProps {
  job: PublicJobPost
}

/**
 * The only place `POST /api/applications/` is called from. Renders
 * differently per viewer:
 * - anonymous: a login link (preserving this job as the post-login destination);
 * - authenticated Employer: nothing (applying is Worker-only, `accounts/permissions.py:IsWorker`);
 * - authenticated Worker: the real Apply flow, gated on the job's `status`
 *   and on whether `GET /api/applications/` already contains this job.
 */
export function ApplyPanel({ job }: ApplyPanelProps) {
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [justApplied, setJustApplied] = useState(false)

  const applicationsQuery = useMyApplications({ enabled: user?.role === 'WORKER' })

  const applyMutation = useMutation({
    mutationFn: () => createApplication({ job: job.id, worker_note: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_QUERY_KEY })
      setSubmitError(null)
      setJustApplied(true)
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.kind === 'validation' && error.fieldErrors?.job) {
          // Duplicate application (or "job not active" caught server-side)
          // — the backend is the authority here, not our cached list, so
          // resync it rather than trusting whatever we had locally.
          queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_QUERY_KEY })
          setSubmitError(error.fieldErrors.job.join(' '))
          return
        }

        if (error.status === 404) {
          setSubmitError('We could not find your worker profile. Please try logging in again.')
          return
        }

        setSubmitError(toBannerMessage(error))
        return
      }

      setSubmitError('Something went wrong — please try again.')
    },
  })

  if (!user) {
    return (
      <p className="mt-4 text-sm text-text-secondary">
        <Link
          to="/login"
          state={{ from: { pathname: location.pathname } }}
          className="font-semibold text-brand-primary hover:underline"
        >
          Log in as a worker
        </Link>{' '}
        to apply.
      </p>
    )
  }

  if (user.role !== 'WORKER') {
    return null
  }

  if (job.status !== 'ACTIVE') {
    return (
      <p className="mt-4 text-sm text-text-secondary">
        This job is no longer accepting applications.
      </p>
    )
  }

  if (applicationsQuery.isLoading) {
    return <SkeletonBlock className="mt-4 h-10 w-full" />
  }

  const existingApplication = applicationsQuery.data?.find((application) => application.job === job.id)

  if (existingApplication) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-sm text-text-secondary">You applied to this job.</p>
        <ApplicationStatusChip status={existingApplication.status} />
        <Link
          to="/worker/applications"
          className="text-sm font-semibold text-brand-primary hover:underline"
        >
          View your applications
        </Link>
      </div>
    )
  }

  if (justApplied) {
    return (
      <div role="status" className="mt-4 rounded-md bg-success-bg p-3 text-success-text">
        <p className="font-semibold">Application sent.</p>
        <p className="text-sm">The employer will review your application.</p>
      </div>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {submitError && <ErrorBanner message={submitError} />}

      <div className="flex flex-col gap-1">
        <label htmlFor="worker-note" className="text-sm font-semibold text-text-primary">
          Note to the employer (optional)
        </label>
        <textarea
          id="worker-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="rounded-sm border border-text-secondary/30 bg-surface px-3 py-2 text-base text-text-primary focus:border-brand-primary"
        />
      </div>

      <Button
        variant="primary"
        onClick={() => applyMutation.mutate()}
        isLoading={applyMutation.isPending}
      >
        Apply
      </Button>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { updateApplicationStatus } from '@/api/endpoints/applications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { useMyApplications, MY_APPLICATIONS_QUERY_KEY } from '@/hooks/useMyApplications'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Button } from '@/components/primitives/Button'
import { ApplicationCard } from '@/components/shared/ApplicationCard'
import { WithdrawConfirmDialog } from '@/components/shared/WithdrawConfirmDialog'
import type { Application } from '@/types/application'

/**
 * `GET /api/applications/` — a bare array, never paginated
 * (`applications/views.py:ApplicationListCreateView.get`). Terminal
 * statuses (REJECTED/WITHDRAWN/COMPLETED/CANCELLED) render as read-only
 * history via `ApplicationCard`'s own `canWorkerWithdraw` gate — no
 * separate "history" section is needed since the same card component
 * already omits the Withdraw action for those.
 */
export function WorkerApplications() {
  const applicationsQuery = useMyApplications()
  const queryClient = useQueryClient()
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const withdrawMutation = useMutation({
    mutationFn: (application: Application) =>
      updateApplicationStatus(application.id, { status: 'WITHDRAWN' }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Application[]>(MY_APPLICATIONS_QUERY_KEY, (current) =>
        current ? current.map((application) => (application.id === updated.id ? updated : application)) : current,
      )
      setWithdrawTarget(null)
      setWithdrawError(null)
    },
    onError: (error: unknown) => {
      // The status may have changed server-side since this list loaded
      // (e.g. an employer acted first) — resync rather than trusting the
      // stale local copy, and surface the backend's own plain-language
      // "Cannot transition..." message via the dialog itself.
      queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_QUERY_KEY })
      setWithdrawError(
        error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.',
      )
    },
  })

  const closeDialog = () => {
    setWithdrawTarget(null)
    setWithdrawError(null)
  }

  return (
    <PageContainer>
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">My Applications</h1>

      {applicationsQuery.isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {applicationsQuery.isError && (
        <ErrorBanner
          message={
            applicationsQuery.error instanceof ApiError
              ? toBannerMessage(applicationsQuery.error)
              : 'Something went wrong — please try again.'
          }
          onRetry={() => applicationsQuery.refetch()}
        />
      )}

      {applicationsQuery.isSuccess && applicationsQuery.data.length === 0 && (
        <EmptyState
          title="You haven't applied to any jobs yet"
          description="Browse active jobs and apply to get started."
          action={
            <Link to="/jobs">
              <Button variant="primary">Browse Jobs</Button>
            </Link>
          }
        />
      )}

      {applicationsQuery.isSuccess && applicationsQuery.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {applicationsQuery.data.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              onWithdraw={setWithdrawTarget}
            />
          ))}
        </div>
      )}

      <WithdrawConfirmDialog
        application={withdrawTarget}
        isSubmitting={withdrawMutation.isPending}
        error={withdrawError}
        onConfirm={() => withdrawTarget && withdrawMutation.mutate(withdrawTarget)}
        onCancel={closeDialog}
      />
    </PageContainer>
  )
}

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateApplicationStatus } from '@/api/endpoints/applications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { jobApplicationsQueryKey } from '@/hooks/useJobApplications'
import { Button } from '@/components/primitives/Button'
import { ConfirmDialog } from '@/components/primitives/ConfirmDialog'
import {
  employerAllowedTransitions,
  transitionRequiresConfirmation,
  TRANSITION_ACTION_LABELS,
} from '@/lib/applicationTransitions'
import type { Application, ApplicationStatus } from '@/types/application'

interface ApplicationTransitionActionsProps {
  application: Application
  jobId: number | string
}

/**
 * Renders only the actions legal for the application's CURRENT status
 * (`applications/services.py:EMPLOYER_ALLOWED_TRANSITIONS`) — never a
 * disabled collection of illegal ones. Forward-progress actions
 * (Shortlist/Contact/Hire/Complete) submit directly; Reject/Cancel go
 * through a confirmation dialog first. A race where the Worker withdrew
 * (or the status otherwise changed) server-side surfaces as the
 * backend's own plain-language "Cannot transition..." message and
 * resyncs the cached list either way.
 */
export function ApplicationTransitionActions({ application, jobId }: ApplicationTransitionActionsProps) {
  const queryClient = useQueryClient()
  const [pendingTarget, setPendingTarget] = useState<ApplicationStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (target: ApplicationStatus) =>
      updateApplicationStatus(application.id, { status: target }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Application[]>(jobApplicationsQueryKey(jobId), (current) =>
        current ? current.map((item) => (item.id === updated.id ? updated : item)) : current,
      )
      setPendingTarget(null)
      setError(null)
    },
    onError: (err: unknown) => {
      // The status may have changed server-side since this list loaded
      // (e.g. the Worker withdrew moments earlier) — resync rather than
      // trusting the stale local copy.
      void queryClient.invalidateQueries({ queryKey: jobApplicationsQueryKey(jobId) })
      setError(
        err instanceof ApiError ? toBannerMessage(err) : 'Something went wrong — please try again.',
      )
    },
  })

  const targets = employerAllowedTransitions(application.status)

  if (targets.length === 0) return null

  const handleClick = (target: ApplicationStatus) => {
    setError(null)
    if (transitionRequiresConfirmation(target)) {
      setPendingTarget(target)
    } else {
      mutation.mutate(target)
    }
  }

  const pendingLabel = pendingTarget ? TRANSITION_ACTION_LABELS[pendingTarget] : undefined

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <Button
            key={target}
            variant={target === 'REJECTED' || target === 'CANCELLED' ? 'danger' : 'secondary'}
            onClick={() => handleClick(target)}
            isLoading={
              mutation.isPending &&
              mutation.variables === target &&
              !transitionRequiresConfirmation(target)
            }
          >
            {TRANSITION_ACTION_LABELS[target]}
          </Button>
        ))}
      </div>

      {error && pendingTarget === null && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-text">
          {error}
        </p>
      )}

      <ConfirmDialog
        isOpen={pendingTarget !== null}
        title={`${pendingLabel ?? 'Confirm'} this application?`}
        description={
          pendingTarget === 'REJECTED'
            ? `${application.worker_username} will be marked as not selected for this job. This can't be undone.`
            : "This application will be cancelled. This can't be undone."
        }
        confirmLabel={pendingLabel ?? 'Confirm'}
        cancelLabel="Go back"
        confirmVariant="danger"
        isConfirming={mutation.isPending}
        error={error}
        onConfirm={() => pendingTarget && mutation.mutate(pendingTarget)}
        onCancel={() => {
          setPendingTarget(null)
          setError(null)
        }}
      />
    </>
  )
}

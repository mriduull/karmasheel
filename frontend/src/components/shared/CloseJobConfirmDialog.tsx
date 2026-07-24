import { ConfirmDialog } from '@/components/primitives/ConfirmDialog'
import type { EmployerJobPost } from '@/types/job'

interface CloseJobConfirmDialogProps {
  job: EmployerJobPost | null
  isSubmitting: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** `job === null` means closed — `ConfirmDialog` itself renders nothing
 * in that case. Copy is accurate to the real backend constraint:
 * `JobPostSerializer.validate_status` rejects `CLOSED -> ACTIVE`, so
 * closing really is one-way — there is no reopen action anywhere in this
 * app. */
export function CloseJobConfirmDialog({
  job,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
}: CloseJobConfirmDialogProps) {
  return (
    <ConfirmDialog
      isOpen={job !== null}
      title="Close this job?"
      description={
        <>
          You're about to close <strong className="text-text-primary">{job?.title}</strong>. New
          applications will stop immediately, and this can't be undone — a closed job can't be
          reopened.
        </>
      }
      confirmLabel="Close job"
      cancelLabel="Keep it open"
      confirmVariant="danger"
      isConfirming={isSubmitting}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

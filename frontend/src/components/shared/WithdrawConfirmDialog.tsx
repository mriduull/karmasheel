import { ConfirmDialog } from '@/components/primitives/ConfirmDialog'
import type { Application } from '@/types/application'

interface WithdrawConfirmDialogProps {
  application: Application | null
  isSubmitting: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * `application === null` means closed — `ConfirmDialog` itself renders
 * nothing in that case. Copy is accurate to the real backend constraint:
 * `unique_application_per_worker_job` blocks a new application to the
 * same job regardless of the old one's status, so withdrawing really
 * does rule out reapplying (matches the F2 restriction on building a
 * reapply flow).
 */
export function WithdrawConfirmDialog({
  application,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
}: WithdrawConfirmDialogProps) {
  return (
    <ConfirmDialog
      isOpen={application !== null}
      title="Withdraw this application?"
      description={
        <>
          You're about to withdraw your application for{' '}
          <strong className="text-text-primary">{application?.job_title}</strong>. This can't be
          undone, and you won't be able to apply to this job again from this account.
        </>
      }
      confirmLabel="Withdraw application"
      cancelLabel="Keep application"
      confirmVariant="danger"
      isConfirming={isSubmitting}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

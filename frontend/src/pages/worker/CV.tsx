import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { fetchWorkerCvPdf, fetchWorkerCvPreviewHtml } from '@/api/endpoints/profiles'
import { ApiError, toBannerMessage } from '@/api/errors'
import { useWorkerProfile } from '@/hooks/useWorkerProfile'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonBlock } from '@/components/primitives/SkeletonBlock'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Button } from '@/components/primitives/Button'
import { CVPreviewFrame } from '@/components/shared/CVPreviewFrame'
import { ProfilePhotoUpload } from '@/components/shared/ProfilePhotoUpload'

/**
 * `GET /api/profiles/worker/me/cv/preview/` (HTML) and
 * `GET /api/profiles/worker/me/cv/pdf/` (binary PDF) — both fully derived
 * from the worker's own stored profile data
 * (profiles/services.py:render_worker_cv_html/render_worker_cv_pdf). No
 * manual CV editor exists; editing happens on the Profile screen.
 */
export function WorkerCV() {
  const profileQuery = useWorkerProfile()
  const previewQuery = useQuery({
    queryKey: ['profiles', 'worker', 'me', 'cv', 'preview'],
    queryFn: fetchWorkerCvPreviewHtml,
  })

  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function handleDownload() {
    setDownloadError(null)
    setIsDownloading(true)

    try {
      const { blob, filename } = await fetchWorkerCvPdf()
      const objectUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()

      // Revoke once the browser has had a chance to start the download —
      // never left dangling, and never revoked before `click()` runs.
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      setDownloadError(
        error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.',
      )
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold text-text-primary">Your CV</h1>
      <p className="mt-1 text-base text-text-secondary">
        Generated automatically from your profile.{' '}
        <Link to="/worker/profile" className="font-semibold text-brand-primary hover:underline">
          Edit your profile
        </Link>{' '}
        to change what appears here — there's no separate CV editor.
      </p>

      <div className="mt-6">
        {previewQuery.isLoading && (
          <div className="flex flex-col gap-4">
            <SkeletonBlock className="h-8 w-1/2" />
            <SkeletonBlock className="h-[60vh] w-full" />
          </div>
        )}

        {previewQuery.isError && (
          <PreviewError error={previewQuery.error} onRetry={() => previewQuery.refetch()} />
        )}

        {previewQuery.isSuccess && (
          <>
            <section className="mb-4 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card sm:p-6">
              <h2 className="text-lg font-semibold text-text-primary">Profile photo</h2>
              <p className="mt-1 text-sm text-text-secondary">Shown in the CV preview and PDF.</p>
              <div className="mt-4">
                <ProfilePhotoUpload
                  currentPhotoUrl={profileQuery.data?.profile_photo_url ?? null}
                  onUploaded={() => previewQuery.refetch()}
                />
              </div>
            </section>

            <div className="mb-4">
              <Button variant="primary" onClick={handleDownload} isLoading={isDownloading}>
                <Download size={18} aria-hidden="true" />
                Download PDF
              </Button>
              {downloadError && (
                <p role="alert" className="mt-2 text-sm font-medium text-danger-text">
                  {downloadError}
                </p>
              )}
            </div>

            <CVPreviewFrame html={previewQuery.data} />
          </>
        )}
      </div>
    </PageContainer>
  )
}

function PreviewError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        title="Complete your profile first"
        description="Your CV is generated from your worker profile — add your details to see a preview."
        action={
          <Link to="/worker/profile">
            <Button variant="primary">Complete your profile</Button>
          </Link>
        }
      />
    )
  }

  return (
    <ErrorBanner
      message={error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.'}
      onRetry={onRetry}
    />
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { updateWorkerProfilePhoto } from '@/api/endpoints/profiles'
import { ApiError, toBannerMessage } from '@/api/errors'
import type { WorkerProfile } from '@/types/profile'
import { WORKER_PROFILE_QUERY_KEY } from '@/hooks/useWorkerProfile'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'

interface ProfilePhotoUploadProps {
  currentPhotoUrl: string | null
  onUploaded?: (profile: WorkerProfile) => void
}

export function ProfilePhotoUpload({ currentPhotoUrl, onUploaded }: ProfilePhotoUploadProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayUrl = previewUrl ?? currentPhotoUrl

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const handleFileChange = (file: File | null) => {
    setError(null)
    setIsSaved(false)
    setSelectedFile(file)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSaved(false)

    if (!selectedFile) {
      setError('Choose a photo before saving.')
      return
    }

    setIsSubmitting(true)

    try {
      const updated = await updateWorkerProfilePhoto(selectedFile)
      queryClient.setQueryData(WORKER_PROFILE_QUERY_KEY, updated)
      onUploaded?.(updated)
      setSelectedFile(null)
      setIsSaved(true)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    } catch (uploadError) {
      setError(
        uploadError instanceof ApiError
          ? toBannerMessage(uploadError)
          : 'Something went wrong - please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-text-secondary/20 bg-surface-muted">
          {displayUrl ? (
            <img src={displayUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-text-secondary">Photo</span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <label htmlFor="profile-photo" className="text-sm font-semibold text-text-primary">
            Profile photo
          </label>
          <input
            ref={inputRef}
            id="profile-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-text-primary file:mr-4 file:min-h-touch file:rounded-sm file:border-0 file:bg-surface-muted file:px-4 file:text-base file:font-semibold file:text-text-primary hover:file:bg-text-secondary/10"
          />
          <p className="text-sm text-text-secondary">JPG, PNG, or WebP. Maximum 2 MB.</p>
          {selectedFile && (
            <p role="status" className="text-sm font-medium text-warning-text">
              Preview only — click Upload photo to save it to your profile.
            </p>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          <Upload size={18} aria-hidden="true" />
          Upload photo
        </Button>
        {isSaved && (
          <span role="status" className="text-sm font-semibold text-success-text">
            Saved
          </span>
        )}
      </div>
    </form>
  )
}

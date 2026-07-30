import { useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { updateWorkerProfile } from '@/api/endpoints/profiles'
import { ApiError, toBannerMessage, toFieldErrors } from '@/api/errors'
import { useWorkerProfile, WORKER_PROFILE_QUERY_KEY } from '@/hooks/useWorkerProfile'
import {
  workerAvailabilitySchema,
  workerBasicsSchema,
  type WorkerAvailabilityFormValues,
  type WorkerBasicsFormValues,
} from '@/validation/workerProfile'
import type { WorkerProfile, WorkerProfileUpdatePayload } from '@/types/profile'
import { PageContainer } from '@/components/primitives/PageContainer'
import { TextField } from '@/components/primitives/TextField'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { ProfileSection } from '@/components/shared/ProfileSection'
import { SkillChipInput } from '@/components/shared/SkillChipInput'
import { SkillChipList } from '@/components/shared/SkillChipList'
import { UnmatchedTermNotice } from '@/components/shared/UnmatchedTermNotice'
import { CoordinateCapture } from '@/components/shared/CoordinateCapture'

/**
 * Four independently-PATCHable sections, matching the design spec's
 * progressive-disclosure pattern AND the verified backend behavior:
 * `WorkerProfileSerializer.update` is a true partial update — any field
 * left out of a given PATCH body is untouched, including `skill_input`
 * (only applied when that key is present at all). Confirmed by reading
 * `backend/profiles/serializers.py` and `backend/profiles/views.py`
 * directly, not assumed from the design spec.
 */
export function WorkerProfile() {
  const profileQuery = useWorkerProfile()

  return (
    <PageContainer>
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Worker Profile</h1>

      {profileQuery.isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {profileQuery.isError && (
        <ErrorBanner
          message={
            profileQuery.error instanceof ApiError
              ? toBannerMessage(profileQuery.error)
              : 'Something went wrong — please try again.'
          }
          onRetry={() => profileQuery.refetch()}
        />
      )}

      {profileQuery.isSuccess && (
        <div className="flex flex-col gap-6">
          <BasicsSection profile={profileQuery.data} />
          <LocationSection profile={profileQuery.data} />
          <SkillsSection profile={profileQuery.data} />
          <AvailabilitySection profile={profileQuery.data} />
        </div>
      )}
    </PageContainer>
  )
}

function BasicsSection({ profile }: { profile: WorkerProfile }) {
  const queryClient = useQueryClient()
  const [isSaved, setIsSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<WorkerBasicsFormValues>({
    resolver: zodResolver(workerBasicsSchema),
    defaultValues: {
      address: profile.address,
      experience_years: String(profile.experience_years),
    },
  })

  const onSubmit = async (values: WorkerBasicsFormValues) => {
    setFormError(null)
    setIsSaved(false)

    try {
      const updated = await updateWorkerProfile({
        address: values.address,
        experience_years: Number(values.experience_years),
      })
      queryClient.setQueryData(WORKER_PROFILE_QUERY_KEY, updated)
      setIsSaved(true)
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = toFieldErrors(error)
        if (fieldErrors) {
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as keyof WorkerBasicsFormValues, { type: 'server', message })
          }
        } else {
          setFormError(toBannerMessage(error))
        }
      } else {
        setFormError('Something went wrong — please try again.')
      }
    }
  }

  return (
    <ProfileSection
      title="Basics"
      description="Your address and experience."
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
      isSaved={isSaved}
      error={formError}
    >
      <TextField label="Address" error={errors.address?.message} {...register('address')} />
      <TextField
        label="Years of experience"
        inputMode="numeric"
        error={errors.experience_years?.message}
        {...register('experience_years')}
      />
    </ProfileSection>
  )
}

function LocationSection({ profile }: { profile: WorkerProfile }) {
  const queryClient = useQueryClient()
  const [isSaved, setIsSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingCoords, setPendingCoords] = useState<{ latitude: number; longitude: number } | null>(
    null,
  )
  const [cleared, setCleared] = useState(false)

  const hasCoordinates = cleared
    ? false
    : pendingCoords !== null || (profile.latitude !== null && profile.longitude !== null)

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setIsSaved(false)
    setIsSubmitting(true)

    let payload: WorkerProfileUpdatePayload = {}
    if (cleared) {
      payload = { latitude: null, longitude: null }
    } else if (pendingCoords) {
      payload = { latitude: pendingCoords.latitude, longitude: pendingCoords.longitude }
    }

    try {
      const updated = await updateWorkerProfile(payload)
      queryClient.setQueryData(WORKER_PROFILE_QUERY_KEY, updated)
      setIsSaved(true)
      setPendingCoords(null)
      setCleared(false)
    } catch (error) {
      setFormError(
        error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ProfileSection
      title="Location"
      description="Optional — improves distance-based job matching. Never guessed from your address."
      onSubmit={handleFormSubmit}
      isSubmitting={isSubmitting}
      isSaved={isSaved}
      error={formError}
    >
      <CoordinateCapture
        hasCoordinates={hasCoordinates}
        onCaptured={(latitude, longitude) => {
          setPendingCoords({ latitude, longitude })
          setCleared(false)
          setIsSaved(false)
        }}
        onClear={() => {
          setCleared(true)
          setPendingCoords(null)
          setIsSaved(false)
        }}
      />
    </ProfileSection>
  )
}

function SkillsSection({ profile }: { profile: WorkerProfile }) {
  const queryClient = useQueryClient()
  const [isSaved, setIsSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Pre-filled with the CURRENT standardized names, not raw phrases (the
  // backend never returns those) — `_apply_skill_input` REPLACES the
  // whole skill set on every save (`instance.skills.set(...)`, not
  // additive), so starting from an empty box would silently delete every
  // existing skill the moment the user adds just one new one.
  const [skillInput, setSkillInput] = useState<string[]>(() => profile.skills.map((skill) => skill.name))
  const [unmatchedTerms, setUnmatchedTerms] = useState<string[]>([])

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setIsSaved(false)
    setIsSubmitting(true)

    try {
      const updated = await updateWorkerProfile({ skill_input: skillInput })
      queryClient.setQueryData(WORKER_PROFILE_QUERY_KEY, updated)
      setUnmatchedTerms(updated.unmatched_terms)
      setSkillInput(updated.skills.map((skill) => skill.name))
      setIsSaved(true)
    } catch (error) {
      setFormError(
        error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ProfileSection
      title="Skills"
      description="Add skills as free text — English or Romanized Nepali both work (e.g. &ldquo;ghar wiring&rdquo;)."
      onSubmit={handleFormSubmit}
      isSubmitting={isSubmitting}
      isSaved={isSaved}
      error={formError}
    >
      <SkillChipInput label="Your skills" value={skillInput} onChange={setSkillInput} />

      {profile.skills.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-text-primary">Confirmed standardized skills</p>
          <SkillChipList skills={profile.skills} />
        </div>
      )}

      <UnmatchedTermNotice terms={unmatchedTerms} />
    </ProfileSection>
  )
}

function AvailabilitySection({ profile }: { profile: WorkerProfile }) {
  const queryClient = useQueryClient()
  const [isSaved, setIsSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<WorkerAvailabilityFormValues>({
    resolver: zodResolver(workerAvailabilitySchema),
    defaultValues: {
      is_available: profile.is_available,
      expected_wage: profile.expected_wage ?? '',
      preferred_travel_radius_km:
        profile.preferred_travel_radius_km !== null ? String(profile.preferred_travel_radius_km) : '',
    },
  })

  const onSubmit = async (values: WorkerAvailabilityFormValues) => {
    setFormError(null)
    setIsSaved(false)

    try {
      const updated = await updateWorkerProfile({
        is_available: values.is_available,
        expected_wage: values.expected_wage === '' ? null : Number(values.expected_wage),
        preferred_travel_radius_km:
          values.preferred_travel_radius_km === '' ? null : Number(values.preferred_travel_radius_km),
      })
      queryClient.setQueryData(WORKER_PROFILE_QUERY_KEY, updated)
      setIsSaved(true)
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = toFieldErrors(error)
        if (fieldErrors) {
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as keyof WorkerAvailabilityFormValues, { type: 'server', message })
          }
        } else {
          setFormError(toBannerMessage(error))
        }
      } else {
        setFormError('Something went wrong — please try again.')
      }
    }
  }

  return (
    <ProfileSection
      title="Availability & Wage"
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
      isSaved={isSaved}
      error={formError}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is-available"
          {...register('is_available')}
          className="h-5 w-5 min-h-touch min-w-touch"
        />
        <label htmlFor="is-available" className="text-base text-text-primary">
          Available for work
        </label>
      </div>
      <TextField
        label="Expected wage"
        hint="Optional — leave blank to remove"
        inputMode="decimal"
        error={errors.expected_wage?.message}
        {...register('expected_wage')}
      />
      <TextField
        label="Preferred travel radius (km)"
        hint="Optional — leave blank to remove"
        inputMode="numeric"
        error={errors.preferred_travel_radius_km?.message}
        {...register('preferred_travel_radius_km')}
      />
    </ProfileSection>
  )
}

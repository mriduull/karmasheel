import { useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { updateEmployerProfile } from '@/api/endpoints/profiles'
import { ApiError, toBannerMessage, toFieldErrors } from '@/api/errors'
import { useEmployerProfile, EMPLOYER_PROFILE_QUERY_KEY } from '@/hooks/useEmployerProfile'
import {
  employerDetailsSchema,
  type EmployerDetailsFormValues,
} from '@/validation/employerProfile'
import { locationValueFromProfile } from '@/lib/locationValue'
import type { EmployerProfile, EmployerProfileUpdatePayload } from '@/types/employer'
import type { LocationValue } from '@/types/location'
import { PageContainer } from '@/components/primitives/PageContainer'
import { PanVatField } from '@/components/primitives/PanVatField'
import { TextField } from '@/components/primitives/TextField'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { ProfileSection } from '@/components/shared/ProfileSection'
import { VerificationStatusBanner } from '@/components/shared/VerificationStatusBanner'
import { LocationPicker } from '@/components/shared/LocationPicker'

/**
 * Two independently-PATCHable sections — same verified pattern as the
 * Worker Profile form (F2): `EmployerProfileSerializer` is a true partial
 * update, so each section's PATCH body only ever includes the fields it
 * owns. Verification status is read-only everywhere on this page —
 * there is no request field that changes it
 * (`EmployerProfileSerializer.Meta.read_only_fields`).
 */
export function EmployerProfile() {
  const profileQuery = useEmployerProfile()

  return (
    <PageContainer>
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Employer Profile</h1>

      {profileQuery.isLoading && (
        <div className="flex flex-col gap-4">
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
          <VerificationStatusBanner status={profileQuery.data.verification_status} />
          <DetailsSection profile={profileQuery.data} />
          <LocationSection profile={profileQuery.data} />
        </div>
      )}
    </PageContainer>
  )
}

function DetailsSection({ profile }: { profile: EmployerProfile }) {
  const queryClient = useQueryClient()
  const [isSaved, setIsSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<EmployerDetailsFormValues>({
    resolver: zodResolver(employerDetailsSchema),
    defaultValues: {
      organization_name: profile.organization_name,
      pan_vat_number: profile.pan_vat_number,
    },
  })

  const onSubmit = async (values: EmployerDetailsFormValues) => {
    setFormError(null)
    setIsSaved(false)

    try {
      const updated = await updateEmployerProfile(values)
      queryClient.setQueryData(EMPLOYER_PROFILE_QUERY_KEY, updated)
      setIsSaved(true)
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = toFieldErrors(error)
        if (fieldErrors) {
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as keyof EmployerDetailsFormValues, { type: 'server', message })
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
      title="Business Details"
      description="Your organization name and PAN/VAT registration number."
      onSubmit={handleSubmit(onSubmit)}
      isSubmitting={isSubmitting}
      isSaved={isSaved}
      error={formError}
    >
      <TextField
        label="Organization name"
        hint="Optional"
        error={errors.organization_name?.message}
        {...register('organization_name')}
      />
      <PanVatField
        label="PAN/VAT number"
        hint="9 digits, e.g. 123456789 — optional"
        error={errors.pan_vat_number?.message}
        {...register('pan_vat_number')}
      />
    </ProfileSection>
  )
}

function LocationSection({ profile }: { profile: EmployerProfile }) {
  const queryClient = useQueryClient()
  const [isSaved, setIsSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialLocationRef = useRef(locationValueFromProfile(profile))
  const [location, setLocation] = useState<LocationValue | null>(initialLocationRef.current)
  const [isDirty, setIsDirty] = useState(false)

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setIsSaved(false)
    setIsSubmitting(true)

    // Only the fields this section actually changed are sent — an
    // untouched save (e.g. a legacy profile with an address but no
    // coordinates yet) must never silently clear existing data.
    const payload: EmployerProfileUpdatePayload = !isDirty
      ? {}
      : location
        ? { address: location.address, latitude: location.latitude, longitude: location.longitude }
        : { address: '', latitude: null, longitude: null }

    try {
      const updated = await updateEmployerProfile(payload)
      queryClient.setQueryData(EMPLOYER_PROFILE_QUERY_KEY, updated)
      setIsSaved(true)
      setIsDirty(false)
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
      description="Optional — used for distance-based matching."
      onSubmit={handleFormSubmit}
      isSubmitting={isSubmitting}
      isSaved={isSaved}
      error={formError}
    >
      <LocationPicker
        value={location}
        onChange={(next) => {
          setLocation(next)
          setIsDirty(true)
          setIsSaved(false)
        }}
        label="Business or organization location"
        description="Used for distance-based matching. Job postings can use a different location."
      />
    </ProfileSection>
  )
}


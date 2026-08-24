import { useEffect, useState, type FormEvent } from 'react'
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
    reset,
    setError,
  } = useForm<EmployerDetailsFormValues>({
    resolver: zodResolver(employerDetailsSchema),
    defaultValues: {
      organization_name: profile.organization_name,
      pan_vat_number: profile.pan_vat_number,
    },
  })

  useEffect(() => {
    reset({
      organization_name: profile.organization_name,
      pan_vat_number: profile.pan_vat_number,
    })
  }, [profile.organization_name, profile.pan_vat_number, reset])

  const onSubmit = async (values: EmployerDetailsFormValues) => {
    setFormError(null)
    setIsSaved(false)

    try {
      const updated = await updateEmployerProfile(values)
      queryClient.setQueryData(EMPLOYER_PROFILE_QUERY_KEY, updated)
      await queryClient.invalidateQueries({ queryKey: EMPLOYER_PROFILE_QUERY_KEY })
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
      description="Your organization name, address, and PAN/VAT registration number."
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
  // Address now travels with latitude/longitude as one LocationPicker-owned
  // value (validation/employerProfile.ts) rather than a separate always-on
  // text field — see DetailsSection above, which no longer touches address.
  const [location, setLocation] = useState<LocationValue | null>(() =>
    profile.latitude !== null && profile.longitude !== null
      ? {
          address: profile.address,
          latitude: Number(profile.latitude),
          longitude: Number(profile.longitude),
          placeId: null,
        }
      : null,
  )

  // Same "always trust fresher server data" convention as DetailsSection's
  // own `reset` effect above — kept in sync with the query cache (e.g.
  // after a background refetch elsewhere), not just the initial mount.
  useEffect(() => {
    setLocation(
      profile.latitude !== null && profile.longitude !== null
        ? {
            address: profile.address,
            latitude: Number(profile.latitude),
            longitude: Number(profile.longitude),
            placeId: null,
          }
        : null,
    )
  }, [profile.address, profile.latitude, profile.longitude])

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setIsSaved(false)
    setIsSubmitting(true)

    // Clearing the picker clears the whole unit, address included — there
    // is no supported way to keep a typed address without coordinates once
    // it's owned by this section.
    const payload: EmployerProfileUpdatePayload = location
      ? { address: location.address, latitude: location.latitude, longitude: location.longitude }
      : { address: '', latitude: null, longitude: null }

    try {
      const updated = await updateEmployerProfile(payload)
      queryClient.setQueryData(EMPLOYER_PROFILE_QUERY_KEY, updated)
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
      title="Location"
      description="Optional — used only for distance-based matching. Never guessed from your address."
      onSubmit={handleFormSubmit}
      isSubmitting={isSubmitting}
      isSaved={isSaved}
      error={formError}
    >
      <LocationPicker
        label="Business location"
        value={location}
        onChange={(value) => {
          setLocation(value)
          setIsSaved(false)
        }}
      />
    </ProfileSection>
  )
}

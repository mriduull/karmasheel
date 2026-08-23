import { useId, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { updateWorkerProfile } from '@/api/endpoints/profiles'
import { ApiError, toBannerMessage, toFieldErrors } from '@/api/errors'
import { useWorkerProfile, WORKER_PROFILE_QUERY_KEY } from '@/hooks/useWorkerProfile'
import { WORKER_JOB_RECOMMENDATIONS_QUERY_KEY } from '@/hooks/useWorkerJobRecommendations'
import { OPPORTUNITY_ADVISORY_QUERY_KEY } from '@/hooks/useOpportunityAdvisory'
import {
  workerAvailabilitySchema,
  workerBasicsSchema,
  type WorkerAvailabilityFormValues,
  type WorkerBasicsFormValues,
} from '@/validation/workerProfile'
import type {
  WorkerProfile,
  WorkerProfileUpdatePayload,
  WorkerSkillMatch,
} from '@/types/profile'
import type { SkillTagSummary } from '@/types/skill'
import { PageContainer } from '@/components/primitives/PageContainer'
import { Button } from '@/components/primitives/Button'
import { TextField } from '@/components/primitives/TextField'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { ProfileSection } from '@/components/shared/ProfileSection'
import { SkillChipInput, type SkillChipInputHandle } from '@/components/shared/SkillChipInput'
import { UnmatchedTermNotice } from '@/components/shared/UnmatchedTermNotice'
import { ManualSkillPicker } from '@/components/shared/ManualSkillPicker'
import { SkillMatchReview } from '@/components/shared/SkillMatchReview'
import { CoordinateCapture } from '@/components/shared/CoordinateCapture'
import { ProfilePhotoUpload } from '@/components/shared/ProfilePhotoUpload'

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
          <PhotoSection profile={profileQuery.data} />
          <BasicsSection profile={profileQuery.data} />
          <LocationSection profile={profileQuery.data} />
          <SkillsSection profile={profileQuery.data} />
          <AvailabilitySection profile={profileQuery.data} />
        </div>
      )}
    </PageContainer>
  )
}

function PhotoSection({ profile }: { profile: WorkerProfile }) {
  return (
    <section className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">Profile photo</h2>
      <p className="mt-1 text-sm text-text-secondary">Shown on your profile and generated CV.</p>
      <div className="mt-4">
        <ProfilePhotoUpload currentPhotoUrl={profile.profile_photo_url} />
      </div>
    </section>
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

interface QueuedSkillReview {
  match: WorkerSkillMatch
}

const skillNameKey = (name: string) => name.trim().toLowerCase()
const skillMatchKey = (match: WorkerSkillMatch) =>
  `${skillNameKey(match.input_term)}-${match.matched_skill?.id ?? 'unmatched'}`

const protectedSkillIdsFromResponse = (
  skills: SkillTagSummary[],
  matches: WorkerSkillMatch[],
) => {
  const unresolvedAutomaticIds = new Set(
    matches.flatMap((match) =>
      match.matched_skill &&
      match.method !== 'exact_name' &&
      !match.matched_skill_was_selected
        ? [match.matched_skill.id]
        : [],
    ),
  )
  const protectedMatchIds = new Set(
    matches.flatMap((match) =>
      match.matched_skill?.id &&
      (match.matched_skill_was_selected || match.method === 'exact_name')
        ? [match.matched_skill.id]
        : [],
    ),
  )

  return new Set(
    skills
      .filter(
        (skill) =>
          !unresolvedAutomaticIds.has(skill.id) || protectedMatchIds.has(skill.id),
      )
      .map((skill) => skill.id),
  )
}

function SkillsSection({ profile }: { profile: WorkerProfile }) {
  const queryClient = useQueryClient()
  const skillInputRef = useRef<SkillChipInputHandle>(null)
  const skillDecisionFocusRef = useRef<HTMLButtonElement>(null)
  const manualPickerId = useId()
  const [isSaved, setIsSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Standardized skills are tracked by ID, separately from new free-text
  // phrases. Names are not globally unique, so category-picker choices must
  // never be round-tripped through name-only matching.
  const [skillInput, setSkillInput] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<SkillTagSummary[]>(profile.skills)
  const [unmatchedTerms, setUnmatchedTerms] = useState<string[]>([])
  const [skillMatches, setSkillMatches] = useState<WorkerSkillMatch[]>(profile.skill_matches)
  const [protectedSkillIds, setProtectedSkillIds] = useState<Set<number>>(() =>
    protectedSkillIdsFromResponse(profile.skills, profile.skill_matches),
  )
  const [queuedReviews, setQueuedReviews] = useState<QueuedSkillReview[]>([])
  const [submittedReviewTerms, setSubmittedReviewTerms] = useState<string[]>([])
  const [showManualPicker, setShowManualPicker] = useState(false)
  const [editNotice, setEditNotice] = useState<string | null>(null)
  const reviewableMatches = skillMatches.filter(
    (match) =>
      match.matched_skill !== null &&
      match.method !== 'exact_name',
  )

  const restoreSkillDecisionFocus = () => skillDecisionFocusRef.current?.focus()

  const dismissAcceptedMatch = (match: WorkerSkillMatch) => {
    const dismissedKey = skillMatchKey(match)
    setSkillMatches((current) =>
      current.filter((candidate) => skillMatchKey(candidate) !== dismissedKey),
    )
    queryClient.setQueryData<WorkerProfile>(WORKER_PROFILE_QUERY_KEY, (current) =>
      current
        ? {
            ...current,
            skill_matches: current.skill_matches.filter(
              (candidate) => skillMatchKey(candidate) !== dismissedKey,
            ),
          }
        : current,
    )
  }

  const markSkillsEdited = (next: string[]) => {
    setSkillInput(next)
    setIsSaved(false)
    setUnmatchedTerms([])
    setSubmittedReviewTerms([])
    setEditNotice(null)
  }

  const replaceAutomaticMatch = (
    match: WorkerSkillMatch,
    replacement: SkillTagSummary,
  ) => {
    const matchedSkill = match.matched_skill
    if (!matchedSkill) return

    const anotherInputUsesMatch =
      protectedSkillIds.has(matchedSkill.id) ||
      skillMatches.some(
        (candidate) =>
          candidate !== match && candidate.matched_skill?.id === matchedSkill.id,
      )
    setSelectedSkills((current) => {
      const withoutDisputedMatch = anotherInputUsesMatch
        ? current
        : current.filter((skill) => skill.id !== matchedSkill.id)
      return withoutDisputedMatch.some((skill) => skill.id === replacement.id)
        ? withoutDisputedMatch
        : [...withoutDisputedMatch, replacement]
    })
    setProtectedSkillIds((current) => {
      const updated = new Set(current)
      if (!anotherInputUsesMatch) updated.delete(matchedSkill.id)
      updated.add(replacement.id)
      return updated
    })
    setSkillMatches((current) => current.filter((candidate) => candidate !== match))
    setQueuedReviews((current) =>
      current.filter((queued) => skillMatchKey(queued.match) !== skillMatchKey(match)),
    )
    setUnmatchedTerms([])
    setSubmittedReviewTerms([])
    setShowManualPicker(false)
    setEditNotice(`${replacement.name} selected. Save this section to apply the change.`)
    setIsSaved(false)
    restoreSkillDecisionFocus()
  }

  const queueAutomaticMatchForReview = (match: WorkerSkillMatch) => {
    const matchedSkill = match.matched_skill
    if (!matchedSkill) return

    const anotherInputUsesMatch =
      protectedSkillIds.has(matchedSkill.id) ||
      skillMatches.some(
        (candidate) =>
          candidate !== match && candidate.matched_skill?.id === matchedSkill.id,
      )
    if (!anotherInputUsesMatch) {
      setSelectedSkills((current) => current.filter((skill) => skill.id !== matchedSkill.id))
      setProtectedSkillIds((current) => {
        const updated = new Set(current)
        updated.delete(matchedSkill.id)
        return updated
      })
    }

    setSkillMatches((current) => current.filter((candidate) => candidate !== match))
    setQueuedReviews((current) =>
      current.some((queued) => skillMatchKey(queued.match) === skillMatchKey(match))
        ? current
        : [...current, { match }],
    )
    setUnmatchedTerms([])
    setSubmittedReviewTerms([])
    setEditNotice(null)
    setIsSaved(false)
    restoreSkillDecisionFocus()
  }

  const cancelQueuedReview = (queued: QueuedSkillReview) => {
    const matchedSkill = queued.match.matched_skill
    if (matchedSkill) {
      setSelectedSkills((current) =>
        current.some((skill) => skill.id === matchedSkill.id)
          ? current
          : [...current, matchedSkill],
      )
      setProtectedSkillIds((current) => {
        const updated = new Set(current)
        updated.add(matchedSkill.id)
        return updated
      })
    }

    setQueuedReviews((current) => current.filter((candidate) => candidate !== queued))
    dismissAcceptedMatch(queued.match)
    setEditNotice(
      `Review request for “${queued.match.input_term}” cancelled; the current match is kept.`,
    )
    restoreSkillDecisionFocus()
  }

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setIsSaved(false)

    const committedSkillInput = skillInputRef.current?.commitDraft() ?? skillInput
    if (committedSkillInput === null) return

    // Re-submit undecided matches as their original phrases. Otherwise a
    // later save for an unrelated skill would silently turn every current
    // automatic match into an explicit selection and make its review card
    // disappear.
    const skillInputForSave = [
      ...reviewableMatches.map((match) => match.input_term),
      ...committedSkillInput,
    ].filter(
      (phrase, index, phrases) =>
        phrases.findIndex(
          (candidate) => skillNameKey(candidate) === skillNameKey(phrase),
        ) === index,
    )
    const explicitSkillIds = selectedSkills
      .filter((skill) => protectedSkillIds.has(skill.id))
      .map((skill) => skill.id)
    const requestedReviewTerms = queuedReviews.map((queued) => queued.match.input_term)

    setIsSubmitting(true)

    try {
      const updated = await updateWorkerProfile({
        skill_input: skillInputForSave,
        skill_ids: explicitSkillIds,
        ...(requestedReviewTerms.length > 0
          ? { skill_review_input: requestedReviewTerms }
          : {}),
      })
      queryClient.setQueryData(WORKER_PROFILE_QUERY_KEY, updated)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: WORKER_JOB_RECOMMENDATIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: OPPORTUNITY_ADVISORY_QUERY_KEY }),
      ])
      const requestedReviewKeys = new Set(requestedReviewTerms.map(skillNameKey))
      setUnmatchedTerms(
        updated.unmatched_terms.filter((term) => !requestedReviewKeys.has(skillNameKey(term))),
      )
      setSubmittedReviewTerms(requestedReviewTerms)
      setSkillInput([])
      setSelectedSkills(updated.skills)
      setSkillMatches(updated.skill_matches)
      setProtectedSkillIds(
        protectedSkillIdsFromResponse(updated.skills, updated.skill_matches),
      )
      setQueuedReviews([])
      setEditNotice(null)
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
      <SkillChipInput
        ref={skillInputRef}
        label="Your skills"
        value={skillInput}
        onChange={markSkillsEdited}
      />

      <div>
        <Button
          ref={skillDecisionFocusRef}
          type="button"
          variant="secondary"
          aria-expanded={showManualPicker}
          aria-controls={manualPickerId}
          onClick={() => setShowManualPicker((current) => !current)}
        >
          Choose a skill manually
        </Button>
      </div>

      {showManualPicker && (
        <ManualSkillPicker
          id={manualPickerId}
          onSelect={(skill) => {
            setSelectedSkills((current) =>
              current.some((candidate) => candidate.id === skill.id)
                ? current
                : [...current, skill],
            )
            setProtectedSkillIds((current) => {
              const updated = new Set(current)
              updated.add(skill.id)
              return updated
            })
            setIsSaved(false)
            setUnmatchedTerms([])
            setSubmittedReviewTerms([])
            setShowManualPicker(false)
            setEditNotice(`${skill.name} selected. Save this section to apply the change.`)
            restoreSkillDecisionFocus()
          }}
          onCancel={() => {
            setShowManualPicker(false)
            restoreSkillDecisionFocus()
          }}
        />
      )}

      {reviewableMatches.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviewableMatches.map((match) => (
            <SkillMatchReview
              key={`${match.input_term}-${match.matched_skill?.id ?? 'unmatched'}`}
              match={match}
              onAccept={() => {
                if (match.matched_skill) {
                  setProtectedSkillIds((current) => {
                    const next = new Set(current)
                    next.add(match.matched_skill!.id)
                    return next
                  })
                  setEditNotice(`Automatic match kept: ${match.matched_skill.name}.`)
                }
                dismissAcceptedMatch(match)
                restoreSkillDecisionFocus()
              }}
              onChoose={(skill) => replaceAutomaticMatch(match, skill)}
              onRequestReview={() => queueAutomaticMatchForReview(match)}
            />
          ))}
        </div>
      )}

      {queuedReviews.length > 0 && (
        <section
          role="status"
          aria-label="Skill reviews waiting to be saved"
          className="rounded-md bg-warning-bg p-3 text-warning-text"
        >
          <p className="text-sm font-semibold">Admin review queued</p>
          <ul className="mt-2 flex flex-col gap-2">
            {queuedReviews.map((queued) => (
              <li
                key={skillMatchKey(queued.match)}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  &ldquo;{queued.match.input_term}&rdquo; will be sent when you save
                  {queued.match.matched_skill &&
                  !selectedSkills.some(
                    (skill) => skill.id === queued.match.matched_skill!.id,
                  )
                    ? `, and ${queued.match.matched_skill.name} will be removed from your profile`
                    : ''}
                  .
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Cancel review for ${queued.match.input_term}`}
                  onClick={() => cancelQueuedReview(queued)}
                >
                  Cancel review
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editNotice && (
        <p role="status" className="text-sm font-medium text-neutral-status-text">
          {editNotice}
        </p>
      )}

      {selectedSkills.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-text-primary">Selected standardized skills</p>
          <ul className="flex flex-wrap gap-2" aria-label="Selected standardized skills">
            {selectedSkills.map((skill) => (
              <li
                key={skill.id}
                className="flex min-h-touch items-center gap-2 rounded-full bg-neutral-status-bg pl-3 text-sm font-medium text-neutral-status-text"
              >
                <span>
                  {skill.name}
                  <span className="ml-1 font-normal text-text-secondary">
                    ({skill.subcategory})
                  </span>
                </span>
                <button
                  type="button"
                  className="flex min-h-touch min-w-touch items-center justify-center rounded-full hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                  aria-label={`Remove ${skill.name} (${skill.subcategory})`}
                  onClick={() => {
                    setSelectedSkills((current) =>
                      current.filter((candidate) => candidate.id !== skill.id),
                    )
                    setProtectedSkillIds((current) => {
                      const updated = new Set(current)
                      updated.delete(skill.id)
                      return updated
                    })
                    setSkillMatches((current) =>
                      current.filter((match) => match.matched_skill?.id !== skill.id),
                    )
                    setIsSaved(false)
                    setUnmatchedTerms([])
                    setSubmittedReviewTerms([])
                    setEditNotice(`${skill.name} removed. Save this section to apply the change.`)
                    restoreSkillDecisionFocus()
                  }}
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <UnmatchedTermNotice terms={unmatchedTerms} />

      {submittedReviewTerms.length > 0 && (
        <div role="status" className="rounded-md bg-success-bg p-3 text-success-text">
          <p className="text-sm font-semibold">Review request recorded</p>
          <ul className="mt-1 list-inside list-disc text-sm">
            {submittedReviewTerms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </div>
      )}
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

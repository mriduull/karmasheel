import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createJob, fetchMyJobs, updateJob } from '@/api/endpoints/jobs'
import { inferJobTaxonomy } from '@/api/endpoints/taxonomy'
import { ApiError, toBannerMessage, toFieldErrors } from '@/api/errors'
import { MY_JOBS_QUERY_KEY } from '@/hooks/useMyJobs'
import { ownerJobQueryKey } from '@/hooks/useOwnerJob'
import { useEmployerProfile } from '@/hooks/useEmployerProfile'
import {
  isDeadlineInPast,
  isDeadlineOnOrAfterScheduledStart,
  isValidJobLocation,
  jobFormSchema,
  type JobFormValues,
} from '@/validation/job'
import { formatWageTypeLabel, formatWorkType, fromDatetimeLocalInputValue, toDatetimeLocalInputValue } from '@/lib/formatters'
import type { EmployerJobPost, WageType, WorkType } from '@/types/job'
import type { LocationValue } from '@/types/location'
import type { JobTaxonomyInferenceRequest, JobTaxonomyMatchedTerm } from '@/types/taxonomy'
import { TextField } from '@/components/primitives/TextField'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { CategorySelect } from './CategorySelect'
import { SubcategorySelect } from './SubcategorySelect'
import { SkillChipInput, type SkillChipInputHandle } from './SkillChipInput'
import { LocationPicker } from './LocationPicker'
import { JobFormSection } from './JobFormSection'
import { JobSkillDecisionScreen } from './JobSkillDecisionScreen'
import { JobSkillInferenceResults } from './JobSkillInferenceResults'

const WAGE_TYPES: WageType[] = ['HOURLY', 'DAILY', 'MONTHLY', 'FIXED']
const WORK_TYPES: WorkType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'ONE_TIME']

interface JobFormProps {
  mode: 'create' | 'edit'
  /** Required (and used to prefill every field) in edit mode. */
  job?: EmployerJobPost
}

function jobFormValues(job?: EmployerJobPost, clearDates = false): JobFormValues {
  return {
    title: job?.title ?? '',
    description: job?.description ?? '',
    category: job ? String(job.category) : '',
    subcategory: job ? String(job.subcategory) : '',
    wage_type: job?.wage_type ?? 'DAILY',
    wage_amount: job?.wage_amount ?? '',
    work_type: job?.work_type ?? 'ONE_TIME',
    required_experience_years: job ? String(job.required_experience_years) : '0',
    number_of_workers_required: job ? String(job.number_of_workers_required) : '1',
    scheduled_datetime:
      !clearDates && job?.scheduled_datetime
        ? toDatetimeLocalInputValue(job.scheduled_datetime)
        : '',
    duration_days:
      job?.duration_days !== null && job?.duration_days !== undefined
        ? String(job.duration_days)
        : '',
    application_deadline:
      !clearDates && job?.application_deadline
        ? toDatetimeLocalInputValue(job.application_deadline)
        : '',
  }
}

/**
 * One combined form for both `/employer/jobs/new` and
 * `/employer/jobs/:id/edit` — `POST /api/jobs/` has no concept of
 * partial creation, so unlike the Worker/Employer profile forms this is
 * a single submit covering every section, not independent per-section
 * PATCHes. Edit mode still uses `PATCH` (never `PUT`) as the safest
 * supported update behavior, sending every currently-displayed field
 * (not a true unchanged-fields-omitted partial, but still safe: it's
 * always the form's own current state, never a stale fragment).
 */
export function JobForm({ mode, job }: JobFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const requiredSkillsRef = useRef<SkillChipInputHandle>(null)
  const preferredSkillsRef = useRef<SkillChipInputHandle>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [requiredSkills, setRequiredSkills] = useState<string[]>(
    () => job?.required_skills.map((skill) => skill.name) ?? [],
  )
  const [preferredSkills, setPreferredSkills] = useState<string[]>(
    () => job?.preferred_skills.map((skill) => skill.name) ?? [],
  )
  const [savedJob, setSavedJob] = useState<EmployerJobPost | null>(null)
  const [inferenceInput, setInferenceInput] = useState<JobTaxonomyInferenceRequest | null>(null)
  const [selectedPreviousJobId, setSelectedPreviousJobId] = useState('')
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null)
  const [location, setLocation] = useState<LocationValue | null>(() =>
    job
      ? {
          address: job.address,
          latitude: Number(job.latitude),
          longitude: Number(job.longitude),
          placeId: null,
        }
      : null,
  )
  const [locationError, setLocationError] = useState<string | null>(null)

  const employerProfileQuery = useEmployerProfile()
  const employerProfile = employerProfileQuery.data
  const employerLocation: LocationValue | null =
    employerProfile && employerProfile.latitude !== null && employerProfile.longitude !== null
      ? {
          address: employerProfile.address,
          latitude: Number(employerProfile.latitude),
          longitude: Number(employerProfile.longitude),
          placeId: null,
        }
      : null

  const previousJobsQuery = useQuery({
    queryKey: MY_JOBS_QUERY_KEY,
    queryFn: fetchMyJobs,
    enabled: mode === 'create',
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: jobFormValues(job),
  })

  const categoryValue = watch('category')
  const subcategoryValue = watch('subcategory')
  const titleValue = watch('title')
  const descriptionValue = watch('description')

  useEffect(() => {
    const hasInferenceSignal =
      titleValue.trim() ||
      descriptionValue.trim() ||
      requiredSkills.length > 0 ||
      preferredSkills.length > 0

    if (!hasInferenceSignal) {
      setInferenceInput(null)
      return
    }

    const timeout = window.setTimeout(() => {
      setInferenceInput({
        title: titleValue,
        description: descriptionValue,
        required_skills: requiredSkills,
        preferred_skills: preferredSkills,
      })
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [descriptionValue, preferredSkills, requiredSkills, titleValue])

  const inferenceQuery = useQuery({
    queryKey: ['taxonomy', 'infer-job-category', inferenceInput],
    queryFn: () => inferJobTaxonomy(inferenceInput as JobTaxonomyInferenceRequest),
    enabled: inferenceInput !== null,
  })

  const inference = inferenceQuery.data

  useEffect(() => {
    if (!inference?.category || !inference.subcategory) return

    const hasExplicitSkillMatch = inference.matched_terms.some(
      (term) => term.source === 'required_skill' || term.source === 'preferred_skill',
    )

    if (!hasExplicitSkillMatch) return

    if (categoryValue !== String(inference.category)) {
      setValue('category', String(inference.category), { shouldValidate: true })
    }

    if (subcategoryValue !== String(inference.subcategory)) {
      setValue('subcategory', String(inference.subcategory), { shouldValidate: true })
    }
  }, [categoryValue, inference, setValue, subcategoryValue])

  const inferredSkillNames =
    inference?.matched_terms
      .filter((term) => term.subcategory === inference.subcategory)
      .map((term) => term.skill_name)
      .filter((name, index, names) => names.indexOf(name) === index) ?? []
  const requiredSkillMatches =
    [...(inference?.matched_terms ?? []), ...(inference?.suggested_terms ?? [])]
      .filter((term) => term.source === 'required_skill')
  const preferredSkillMatches =
    [...(inference?.matched_terms ?? []), ...(inference?.suggested_terms ?? [])]
      .filter((term) => term.source === 'preferred_skill')

  const selectMappedSkill = (
    match: JobTaxonomyMatchedTerm,
    skillName: string,
    setSkills: Dispatch<SetStateAction<string[]>>,
  ) => {
    setSkills((skills) => skills.map((skill) =>
      skill.trim().toLocaleLowerCase() === match.term.trim().toLocaleLowerCase()
        ? skillName
        : skill,
    ))
  }

  const duplicatePreviousJob = () => {
    const previousJob = previousJobsQuery.data?.find(
      (candidate) => String(candidate.id) === selectedPreviousJobId,
    )
    if (!previousJob) return

    const nextRequiredSkills = previousJob.required_skills.map((skill) => skill.name)
    const nextPreferredSkills = previousJob.preferred_skills.map((skill) => skill.name)

    reset(jobFormValues(previousJob, true))
    setLocation({
      address: previousJob.address,
      latitude: Number(previousJob.latitude),
      longitude: Number(previousJob.longitude),
      placeId: null,
    })
    setLocationError(null)
    requiredSkillsRef.current?.clearDraft()
    preferredSkillsRef.current?.clearDraft()
    setRequiredSkills(nextRequiredSkills)
    setPreferredSkills(nextPreferredSkills)
    setInferenceInput({
      title: previousJob.title,
      description: previousJob.description,
      required_skills: nextRequiredSkills,
      preferred_skills: nextPreferredSkills,
    })
    setFormError(null)
    setDuplicateNotice(
      `Copied reusable details from “${previousJob.title}”. Enter a new scheduled start and application deadline before publishing.`,
    )
  }

  const onSubmit = async (values: JobFormValues) => {
    setFormError(null)

    if (!isValidJobLocation(location) || !location) {
      setLocationError('Select a location for this job.')
      return
    }

    if (mode === 'create' && isDeadlineInPast(values.application_deadline)) {
      setError('application_deadline', { message: 'Application deadline cannot be in the past.' })
      return
    }

    if (
      isDeadlineOnOrAfterScheduledStart(
        values.application_deadline,
        values.scheduled_datetime,
      )
    ) {
      setError('application_deadline', {
        message: 'Application deadline must be earlier than the scheduled start.',
      }, { shouldFocus: true })
      return
    }

    const committedRequiredSkills = requiredSkillsRef.current?.commitDraft() ?? requiredSkills
    if (committedRequiredSkills === null) return

    const committedPreferredSkills = preferredSkillsRef.current?.commitDraft() ?? preferredSkills
    if (committedPreferredSkills === null) return

    const payload = {
      title: values.title,
      category: Number(values.category),
      subcategory: Number(values.subcategory),
      description: values.description,
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      required_experience_years: Number(values.required_experience_years),
      wage_type: values.wage_type,
      wage_amount: Number(values.wage_amount),
      work_type: values.work_type,
      scheduled_datetime: values.scheduled_datetime
        ? fromDatetimeLocalInputValue(values.scheduled_datetime)
        : null,
      duration_days: values.duration_days === '' ? null : Number(values.duration_days),
      number_of_workers_required: Number(values.number_of_workers_required),
      application_deadline: values.application_deadline
        ? fromDatetimeLocalInputValue(values.application_deadline)
        : null,
      required_skills_input: committedRequiredSkills,
      preferred_skills_input: committedPreferredSkills,
    }

    try {
      const result = mode === 'create' ? await createJob(payload) : await updateJob(job!.id, payload)

      await queryClient.invalidateQueries({ queryKey: MY_JOBS_QUERY_KEY })
      queryClient.setQueryData(ownerJobQueryKey(result.id), result)

      const hasReviewableMatches = [
        ...result.required_skill_matches,
        ...result.preferred_skill_matches,
      ].some((match) => match.matched_skill !== null && match.method !== 'exact_name')

      if (result.unmatched_required_terms.length > 0 || result.unmatched_preferred_terms.length > 0 || hasReviewableMatches) {
        // Stay on this screen long enough for the unmatched-term notice
        // to actually be seen, rather than redirecting it away instantly.
        setSavedJob(result)
      } else {
        navigate(`/employer/jobs/${result.id}`, { replace: true })
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 403) {
          setFormError(
            error.detail ?? 'Only verified employers can post jobs. Check your verification status.',
          )
          return
        }

        const fieldErrors = toFieldErrors(error)
        if (fieldErrors) {
          const knownFields = new Set(Object.keys(jobFormSchema.shape))
          for (const [field, message] of Object.entries(fieldErrors)) {
            if (knownFields.has(field)) {
              setError(field as keyof JobFormValues, { type: 'server', message })
            } else {
              setFormError(message)
            }
          }
        } else {
          setFormError(toBannerMessage(error))
        }
      } else {
        setFormError('Something went wrong — please try again.')
      }
    }
  }

  // Location isn't RHF-registered (see the `location` state above), so
  // react-hook-form's own `handleSubmit` never sees it — without this
  // wrapper, a missing location would only surface once every other field
  // already passed validation, instead of alongside them on the same click.
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    setLocationError(
      location && isValidJobLocation(location) ? null : 'Select a location for this job.',
    )
    return handleSubmit(onSubmit)(event)
  }

  if (savedJob) {
    return <JobSkillDecisionScreen job={savedJob} wasCreated={mode === 'create'} />
  }

  return (
    <form onSubmit={handleFormSubmit} noValidate className="flex flex-col gap-6">
      {mode === 'create' && (
        <p className="text-sm text-text-secondary">
          This job will be visible to workers immediately once you publish it — there is no draft
          state.
        </p>
      )}

      {formError && <ErrorBanner message={formError} />}

      {mode === 'create' && (
        <JobFormSection
          title="Duplicate Job"
          description="Choose one of your previous jobs to reuse its details. Scheduled start and application deadline are never copied."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="previous-job" className="text-base font-semibold text-text-primary">
                Previous job
              </label>
              <select
                id="previous-job"
                value={selectedPreviousJobId}
                onChange={(event) => {
                  setSelectedPreviousJobId(event.target.value)
                  setDuplicateNotice(null)
                }}
                disabled={previousJobsQuery.isPending || previousJobsQuery.isError}
                className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary disabled:opacity-60"
              >
                <option value="">
                  {previousJobsQuery.isPending
                    ? 'Loading previous jobs…'
                    : 'Select a previous job'}
                </option>
                {(previousJobsQuery.data ?? []).map((previousJob) => (
                  <option key={previousJob.id} value={previousJob.id}>
                    {previousJob.title}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={duplicatePreviousJob}
              disabled={!selectedPreviousJobId || previousJobsQuery.isPending}
            >
              Use Previous Job
            </Button>
          </div>
          {previousJobsQuery.isSuccess && previousJobsQuery.data.length === 0 && (
            <p className="text-sm text-text-secondary">You do not have any previous jobs to duplicate.</p>
          )}
          {previousJobsQuery.isError && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              Previous jobs could not be loaded. Please try again.
            </p>
          )}
          {duplicateNotice && (
            <p role="status" className="text-sm font-medium text-success-text">
              {duplicateNotice}
            </p>
          )}
        </JobFormSection>
      )}

      <JobFormSection title="Basics">
        <TextField label="Title" error={errors.title?.message} {...register('title')} />
        <div className="flex flex-col gap-1">
          <label htmlFor="job-description" className="text-base font-semibold text-text-primary">
            Description
          </label>
          <textarea
            id="job-description"
            rows={5}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? 'job-description-error' : undefined}
            className="rounded-sm border border-text-secondary/30 bg-surface px-3 py-2 text-base text-text-primary focus:border-brand-primary"
            {...register('description')}
          />
          {errors.description && (
            <span id="job-description-error" role="alert" className="text-sm font-medium text-danger-text">
              {errors.description.message}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-md border border-text-secondary/10 bg-surface-muted p-4">
          <div>
            <h3 className="text-base font-semibold text-text-primary">Skills</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Add required or preferred skills first. Recognized skills automatically select the matching category and subcategory.
            </p>
          </div>
          <SkillChipInput ref={requiredSkillsRef} label="Required skills" value={requiredSkills} onChange={setRequiredSkills} />
          <JobSkillInferenceResults
            matches={requiredSkillMatches}
            selectedSubcategoryId={subcategoryValue ? Number(subcategoryValue) : null}
            onSelectSkill={(match, skillName) => selectMappedSkill(match, skillName, setRequiredSkills)}
          />
          <SkillChipInput ref={preferredSkillsRef} label="Preferred skills" value={preferredSkills} onChange={setPreferredSkills} />
          <JobSkillInferenceResults
            matches={preferredSkillMatches}
            selectedSubcategoryId={subcategoryValue ? Number(subcategoryValue) : null}
            onSelectSkill={(match, skillName) => selectMappedSkill(match, skillName, setPreferredSkills)}
          />
        </div>
        <CategorySelect
          value={categoryValue ? Number(categoryValue) : null}
          onChange={(id) => {
            setValue('category', id ? String(id) : '', { shouldValidate: true })
            setValue('subcategory', '', { shouldValidate: false })
          }}
        />
        {errors.category && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {errors.category.message}
          </p>
        )}
        <SubcategorySelect
          categoryId={categoryValue ? Number(categoryValue) : null}
          value={subcategoryValue ? Number(subcategoryValue) : null}
          onChange={(id) => setValue('subcategory', id ? String(id) : '', { shouldValidate: true })}
        />
        {inference?.subcategory && subcategoryValue === String(inference.subcategory) && (
          <p className="text-sm font-medium text-success-text">
            Auto-selected {inference.subcategory_name}
            {inferredSkillNames.length > 0 ? ` based on ${inferredSkillNames.join(', ')}.` : '.'}
          </p>
        )}
        {errors.subcategory && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {errors.subcategory.message}
          </p>
        )}
      </JobFormSection>

      <JobFormSection title="Location">
        {employerLocation && (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => {
              setLocation(employerLocation)
              setLocationError(null)
            }}
          >
            Use employer profile location
          </Button>
        )}
        <LocationPicker
          label="Job location"
          description="Search, tap the map, or use your current location — required."
          value={location}
          onChange={(value) => {
            setLocation(value)
            setLocationError(null)
          }}
          error={locationError ?? undefined}
        />
      </JobFormSection>

      <JobFormSection title="Work terms">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="wage_type" className="text-base font-semibold text-text-primary">
              Wage type
            </label>
            <select
              id="wage_type"
              className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary"
              {...register('wage_type')}
            >
              {WAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatWageTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Wage amount"
            inputMode="decimal"
            hint="Rs."
            error={errors.wage_amount?.message}
            {...register('wage_amount')}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="work_type" className="text-base font-semibold text-text-primary">
              Work type
            </label>
            <select
              id="work_type"
              className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary"
              {...register('work_type')}
            >
              {WORK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatWorkType(type)}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Required experience (years)"
            inputMode="numeric"
            error={errors.required_experience_years?.message}
            {...register('required_experience_years')}
          />
          <TextField
            label="Number of workers needed"
            inputMode="numeric"
            error={errors.number_of_workers_required?.message}
            {...register('number_of_workers_required')}
          />
          <TextField
            label="Scheduled start"
            type="datetime-local"
            hint="Optional"
            error={errors.scheduled_datetime?.message}
            {...register('scheduled_datetime')}
          />
          <TextField
            label="Duration (days)"
            inputMode="numeric"
            hint="Optional — leave blank to remove"
            error={errors.duration_days?.message}
            {...register('duration_days')}
          />
          <TextField
            label="Application deadline"
            type="datetime-local"
            hint="Optional"
            error={errors.application_deadline?.message}
            {...register('application_deadline')}
          />
        </div>
      </JobFormSection>

      <Button type="submit" variant="primary" isLoading={isSubmitting} className="self-start">
        {mode === 'create' ? 'Publish job' : 'Save changes'}
      </Button>
    </form>
  )
}

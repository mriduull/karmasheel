import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createJob, updateJob } from '@/api/endpoints/jobs'
import { ApiError, toBannerMessage, toFieldErrors } from '@/api/errors'
import { MY_JOBS_QUERY_KEY } from '@/hooks/useMyJobs'
import { ownerJobQueryKey } from '@/hooks/useOwnerJob'
import { jobFormSchema, isDeadlineInPast, type JobFormValues } from '@/validation/job'
import { formatWageTypeLabel, formatWorkType, fromDatetimeLocalInputValue, toDatetimeLocalInputValue } from '@/lib/formatters'
import type { EmployerJobPost, WageType, WorkType } from '@/types/job'
import { TextField } from '@/components/primitives/TextField'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { CategorySelect } from './CategorySelect'
import { SubcategorySelect } from './SubcategorySelect'
import { SkillChipInput, type SkillChipInputHandle } from './SkillChipInput'
import { UnmatchedTermNotice } from './UnmatchedTermNotice'
import { JobLocationFields } from './JobLocationFields'
import { JobFormSection } from './JobFormSection'

const WAGE_TYPES: WageType[] = ['HOURLY', 'DAILY', 'MONTHLY', 'FIXED']
const WORK_TYPES: WorkType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'ONE_TIME']

interface JobFormProps {
  mode: 'create' | 'edit'
  /** Required (and used to prefill every field) in edit mode. */
  job?: EmployerJobPost
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
  const [unmatchedRequired, setUnmatchedRequired] = useState<string[]>([])
  const [unmatchedPreferred, setUnmatchedPreferred] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      title: job?.title ?? '',
      description: job?.description ?? '',
      category: job ? String(job.category) : '',
      subcategory: job ? String(job.subcategory) : '',
      address: job?.address ?? '',
      latitude: job?.latitude ?? '',
      longitude: job?.longitude ?? '',
      wage_type: job?.wage_type ?? 'DAILY',
      wage_amount: job?.wage_amount ?? '',
      work_type: job?.work_type ?? 'ONE_TIME',
      required_experience_years: job ? String(job.required_experience_years) : '0',
      number_of_workers_required: job ? String(job.number_of_workers_required) : '1',
      scheduled_datetime: job?.scheduled_datetime ? toDatetimeLocalInputValue(job.scheduled_datetime) : '',
      duration_days: job?.duration_days !== null && job?.duration_days !== undefined ? String(job.duration_days) : '',
      application_deadline: job?.application_deadline
        ? toDatetimeLocalInputValue(job.application_deadline)
        : '',
    },
  })

  const categoryValue = watch('category')
  const subcategoryValue = watch('subcategory')

  const onSubmit = async (values: JobFormValues) => {
    setFormError(null)

    if (mode === 'create' && isDeadlineInPast(values.application_deadline)) {
      setError('application_deadline', { message: 'Application deadline cannot be in the past.' })
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
      address: values.address,
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
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

      if (result.unmatched_required_terms.length > 0 || result.unmatched_preferred_terms.length > 0) {
        // Stay on this screen long enough for the unmatched-term notice
        // to actually be seen, rather than redirecting it away instantly.
        setSavedJob(result)
        setUnmatchedRequired(result.unmatched_required_terms)
        setUnmatchedPreferred(result.unmatched_preferred_terms)
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

  if (savedJob) {
    return (
      <div className="flex flex-col gap-4">
        <div role="status" className="rounded-md bg-success-bg p-4 text-success-text">
          <p className="font-semibold">
            {mode === 'create' ? 'Job published.' : 'Job updated.'}
          </p>
        </div>
        <UnmatchedTermNotice terms={[...unmatchedRequired, ...unmatchedPreferred]} />
        <Button variant="primary" onClick={() => navigate(`/employer/jobs/${savedJob.id}`)}>
          View Job
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {mode === 'create' && (
        <p className="text-sm text-text-secondary">
          This job will be visible to workers immediately once you publish it — there is no draft
          state.
        </p>
      )}

      {formError && <ErrorBanner message={formError} />}

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
        {errors.subcategory && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {errors.subcategory.message}
          </p>
        )}
      </JobFormSection>

      <JobFormSection title="Location">
        <JobLocationFields register={register} errors={errors} setValue={setValue} />
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

      <JobFormSection
        title="Skills"
        description="Add skills as free text — English or Romanized Nepali both work."
      >
        <SkillChipInput
          ref={requiredSkillsRef}
          label="Required skills"
          value={requiredSkills}
          onChange={setRequiredSkills}
        />
        <SkillChipInput
          ref={preferredSkillsRef}
          label="Preferred skills"
          value={preferredSkills}
          onChange={setPreferredSkills}
        />
      </JobFormSection>

      <Button type="submit" variant="primary" isLoading={isSubmitting} className="self-start">
        {mode === 'create' ? 'Publish job' : 'Save changes'}
      </Button>
    </form>
  )
}

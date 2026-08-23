import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { browseJobs, type JobBrowseFilters } from '@/api/endpoints/jobs'
import { updateWorkerProfile } from '@/api/endpoints/profiles'
import { ApiError, toBannerMessage } from '@/api/errors'
import { useGeolocation } from '@/lib/useGeolocation'
import { useAuthStore } from '@/state/authStore'
import { WORKER_PROFILE_QUERY_KEY } from '@/hooks/useWorkerProfile'
import { WORKER_JOB_RECOMMENDATIONS_QUERY_KEY } from '@/hooks/useWorkerJobRecommendations'
import { OPPORTUNITY_ADVISORY_QUERY_KEY } from '@/hooks/useOpportunityAdvisory'
import type { WorkType } from '@/types/job'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Button } from '@/components/primitives/Button'
import { JobCard } from '@/components/shared/JobCard'
import { JobFilterPanel } from '@/components/shared/JobFilterPanel'

const SKELETON_COUNT = 6
const DEFAULT_LOCATION_DISTANCE_KM = 10

/**
 * `category`/`subcategory`/`work_type` live in the URL (so a Landing-page
 * category tile or a shared link pre-filters this screen); `latitude`/
 * `longitude` are deliberately kept out of the URL (not persisted or
 * shareable) since they come from the visitor's own device location.
 */
export function JobBrowse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null)
  const [locationSaveStatus, setLocationSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const geolocation = useGeolocation()
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const applyDefaultDistanceAfterLocation = useRef(false)

  useEffect(() => {
    if (geolocation.status !== 'success' || !applyDefaultDistanceAfterLocation.current) return

    applyDefaultDistanceAfterLocation.current = false
    setMaxDistanceKm((currentDistance) => currentDistance ?? DEFAULT_LOCATION_DISTANCE_KM)

    if (
      user?.role !== 'WORKER' ||
      geolocation.latitude === null ||
      geolocation.longitude === null
    ) {
      setLocationSaveStatus('idle')
      return
    }

    let active = true
    setLocationSaveStatus('saving')

    void updateWorkerProfile({
      latitude: geolocation.latitude,
      longitude: geolocation.longitude,
    })
      .then(async (updatedProfile) => {
        queryClient.setQueryData(WORKER_PROFILE_QUERY_KEY, updatedProfile)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: WORKER_JOB_RECOMMENDATIONS_QUERY_KEY }),
          queryClient.invalidateQueries({ queryKey: OPPORTUNITY_ADVISORY_QUERY_KEY }),
        ])
        if (active) setLocationSaveStatus('saved')
      })
      .catch(() => {
        if (active) setLocationSaveStatus('error')
      })

    return () => {
      active = false
    }
  }, [
    geolocation.status,
    geolocation.latitude,
    geolocation.longitude,
    queryClient,
    user?.role,
  ])

  const categoryParam = searchParams.get('category')
  const subcategoryParam = searchParams.get('subcategory')
  const workTypeParam = searchParams.get('work_type')

  const categoryId = categoryParam ? Number(categoryParam) : null
  const subcategoryId = subcategoryParam ? Number(subcategoryParam) : null
  const workType = (workTypeParam as WorkType | null) ?? null

  const hasCoordinates = geolocation.status === 'success'

  const filters: JobBrowseFilters = {
    category: categoryId ?? undefined,
    subcategory: subcategoryId ?? undefined,
    workType: workType ?? undefined,
    latitude: hasCoordinates ? (geolocation.latitude ?? undefined) : undefined,
    longitude: hasCoordinates ? (geolocation.longitude ?? undefined) : undefined,
    maxDistanceKm: hasCoordinates && maxDistanceKm !== null ? maxDistanceKm : undefined,
  }

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'browse', filters],
    queryFn: () => browseJobs(filters),
  })

  // Every field that must change together (e.g. category + resetting
  // subcategory) has to go through ONE call with multiple keys — two
  // separate calls in the same tick would each read the same
  // pre-update `searchParams` snapshot, so the second call would
  // silently discard the first.
  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    }
    setSearchParams(next, { replace: true })
  }

  const hasActiveFilters = Boolean(
    categoryId || subcategoryId || workType || (hasCoordinates && maxDistanceKm !== null),
  )

  const handleClearFilters = () => {
    setSearchParams({}, { replace: true })
    setMaxDistanceKm(null)
  }

  const handleRequestLocation = () => {
    applyDefaultDistanceAfterLocation.current = true
    setLocationSaveStatus('idle')
    geolocation.request()
  }

  const jobs = jobsQuery.data ?? []

  return (
    <PageContainer>
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Browse Jobs</h1>

      <div className="mb-6">
        <JobFilterPanel
          categoryId={categoryId}
          subcategoryId={subcategoryId}
          workType={workType}
          maxDistanceKm={maxDistanceKm}
          onCategoryChange={(id) =>
            // Changing category always resets subcategory too — both are
            // applied in a single updateParams call so neither update
            // clobbers the other (see updateParams's own note on this).
            updateParams({ category: id ? String(id) : null, subcategory: null })
          }
          onSubcategoryChange={(id) => updateParams({ subcategory: id ? String(id) : null })}
          onWorkTypeChange={(wt) => updateParams({ work_type: wt })}
          onMaxDistanceChange={setMaxDistanceKm}
          geolocationStatus={geolocation.status}
          locationSaveStatus={locationSaveStatus}
          savesLocationToProfile={user?.role === 'WORKER'}
          onRequestLocation={handleRequestLocation}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />
      </div>

      {jobsQuery.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      )}

      {jobsQuery.isError && (
        <ErrorBanner
          message={
            jobsQuery.error instanceof ApiError
              ? toBannerMessage(jobsQuery.error)
              : 'Something went wrong — please try again.'
          }
          onRetry={() => jobsQuery.refetch()}
        />
      )}

      {jobsQuery.isSuccess && jobs.length === 0 && (
        <EmptyState
          title="No jobs match your filters yet"
          description="Try a different category, work type, or a wider distance."
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={handleClearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {jobsQuery.isSuccess && jobs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </PageContainer>
  )
}

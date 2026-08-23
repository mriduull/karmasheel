import { LocateFixed } from 'lucide-react'
import type { WorkType } from '@/types/job'
import type { GeolocationStatus } from '@/lib/useGeolocation'
import { Button } from '@/components/primitives/Button'
import { CategorySelect } from './CategorySelect'
import { SubcategorySelect } from './SubcategorySelect'
import { WorkTypeSelect } from './WorkTypeSelect'

const DISTANCE_OPTIONS_KM = [5, 10, 20, 50]

interface JobFilterPanelProps {
  categoryId: number | null
  subcategoryId: number | null
  workType: WorkType | null
  maxDistanceKm: number | null
  onCategoryChange: (categoryId: number | null) => void
  onSubcategoryChange: (subcategoryId: number | null) => void
  onWorkTypeChange: (workType: WorkType | null) => void
  onMaxDistanceChange: (maxDistanceKm: number | null) => void
  geolocationStatus: GeolocationStatus
  locationSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  savesLocationToProfile: boolean
  onRequestLocation: () => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}

/**
 * Category → subcategory (dependent), work type, and optional distance
 * filtering — the exact filter set `GET /api/jobs/browse/` supports, and
 * nothing more (no keyword/title search field exists here, deliberately —
 * the endpoint has no such parameter).
 *
 * Always visible and responsively stacked (1 column on mobile, a wider
 * row on larger screens) rather than a slide-up sheet — a simpler,
 * F0-primitive-only foundation for this phase; a true bottom-sheet
 * pattern is a candidate follow-up, not required by this phase's scope.
 */
export function JobFilterPanel({
  categoryId,
  subcategoryId,
  workType,
  maxDistanceKm,
  onCategoryChange,
  onSubcategoryChange,
  onWorkTypeChange,
  onMaxDistanceChange,
  geolocationStatus,
  locationSaveStatus,
  savesLocationToProfile,
  onRequestLocation,
  onClearFilters,
  hasActiveFilters,
}: JobFilterPanelProps) {
  const hasLocation = geolocationStatus === 'success'

  return (
    <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CategorySelect
          value={categoryId}
          onChange={onCategoryChange}
        />
        <SubcategorySelect
          categoryId={categoryId}
          value={subcategoryId}
          onChange={onSubcategoryChange}
        />
        <WorkTypeSelect value={workType} onChange={onWorkTypeChange} />

        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-text-primary">Distance</span>
          <div className="flex min-w-0 flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onRequestLocation}
              isLoading={geolocationStatus === 'loading'}
              className="w-full whitespace-nowrap"
            >
              <LocateFixed size={18} aria-hidden="true" />
              {hasLocation ? 'Update my location' : 'Use my location'}
            </Button>
            <select
              aria-label="Maximum distance"
              className="min-h-touch w-full min-w-0 rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
              value={maxDistanceKm ?? ''}
              onChange={(event) =>
                onMaxDistanceChange(event.target.value ? Number(event.target.value) : null)
              }
              disabled={!hasLocation}
            >
              <option value="">Any distance</option>
              {DISTANCE_OPTIONS_KM.map((km) => (
                <option key={km} value={km}>
                  Within {km} km
                </option>
              ))}
            </select>
          </div>
          {hasLocation && (
            <p role="status" className="text-sm font-medium text-success-text">
              {locationSaveStatus === 'saving'
                ? 'Location found — saving to your profile'
                : locationSaveStatus === 'saved'
                  ? 'Location saved to your profile'
                  : 'Location found'}
              {maxDistanceKm !== null
                ? ` — showing jobs within ${maxDistanceKm} km.`
                : ' — choose a distance to filter jobs.'}
            </p>
          )}
          {hasLocation && savesLocationToProfile && locationSaveStatus === 'error' && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              Jobs are filtered using this location, but it could not be saved to your profile.
              Try again.
            </p>
          )}
          {geolocationStatus === 'denied' && (
            <p className="text-sm text-text-secondary">
              Location permission is blocked. Allow it in your browser settings, then try again.
            </p>
          )}
          {geolocationStatus === 'error' && (
            <p className="text-sm text-text-secondary">
              We couldn't get your location — you can still browse without distance filtering.
            </p>
          )}
          {geolocationStatus === 'unsupported' && (
            <p className="text-sm text-text-secondary">
              Your browser doesn't support location — you can still browse without distance filtering.
            </p>
          )}
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}

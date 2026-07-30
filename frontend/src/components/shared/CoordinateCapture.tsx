import { useEffect } from 'react'
import { LocateFixed, X } from 'lucide-react'
import { useGeolocation } from '@/lib/useGeolocation'
import { Button } from '@/components/primitives/Button'

interface CoordinateCaptureProps {
  hasCoordinates: boolean
  onCaptured: (latitude: number, longitude: number) => void
  onClear: () => void
}

/**
 * Geolocation is requested only after the user presses "Use my
 * location" — never automatically. Denial/failure is presented as a
 * plain, non-blocking note, never as an error the rest of the form
 * reacts to; nothing here invents coordinates from the address text.
 */
export function CoordinateCapture({ hasCoordinates, onCaptured, onClear }: CoordinateCaptureProps) {
  const geolocation = useGeolocation()

  useEffect(() => {
    if (geolocation.status === 'success' && geolocation.latitude !== null && geolocation.longitude !== null) {
      onCaptured(geolocation.latitude, geolocation.longitude)
    }
    // Only re-run when the capture itself changes — `onCaptured` is a
    // fresh closure each render in the caller, not a stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geolocation.status, geolocation.latitude, geolocation.longitude])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-text-primary">
        {hasCoordinates ? 'Location saved.' : 'No location on file yet.'}
      </p>
      <p className="text-sm text-text-secondary">
        {hasCoordinates
          ? 'Used only to filter and rank jobs by distance.'
          : "Distance-based job matching won't be available until a location is saved — everything else works fine without it."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={geolocation.request}
          isLoading={geolocation.status === 'loading'}
        >
          <LocateFixed size={18} aria-hidden="true" />
          Use my location
        </Button>
        {hasCoordinates && (
          <Button type="button" variant="secondary" onClick={onClear}>
            <X size={18} aria-hidden="true" />
            Remove saved location
          </Button>
        )}
      </div>

      {geolocation.status === 'denied' && (
        <p role="status" className="text-sm text-text-secondary">
          Location permission was declined — you can still save your profile without it.
        </p>
      )}
      {geolocation.status === 'error' && (
        <p role="status" className="text-sm text-text-secondary">
          We couldn't get your location — you can still save your profile without it.
        </p>
      )}
      {geolocation.status === 'unsupported' && (
        <p role="status" className="text-sm text-text-secondary">
          Your browser doesn't support location — you can still save your profile without it.
        </p>
      )}
      {geolocation.status === 'success' && (
        <p role="status" className="text-sm text-success-text">
          Location captured — remember to save this section.
        </p>
      )}
    </div>
  )
}

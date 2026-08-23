import { useCallback, useState } from 'react'

export type GeolocationStatus = 'idle' | 'loading' | 'success' | 'denied' | 'error' | 'unsupported'

interface GeolocationState {
  status: GeolocationStatus
  latitude: number | null
  longitude: number | null
  /** Metres, per `GeolocationCoordinates.accuracy` — the browser's own
   * estimate, shown (when present) as a "within approximately X metres"
   * note rather than implying GPS-grade precision. `null` until a
   * successful read. */
  accuracy: number | null
  /** Explicitly requests the browser's geolocation permission. Never
   * called automatically — only in response to the user choosing
   * "Use my location". */
  request: () => void
}

/**
 * Thin wrapper over the browser Geolocation API. Missing/denied location
 * is never treated as an error state the rest of the UI needs to react
 * to — callers (the job-browse distance filter, `LocationPicker`) simply
 * leave that capability off and let the user continue manually.
 */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }

    setStatus('loading')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setAccuracy(position.coords.accuracy ?? null)
        setStatus('success')
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error')
      },
      { timeout: 10_000, enableHighAccuracy: true },
    )
  }, [])

  return { status, latitude, longitude, accuracy, request }
}

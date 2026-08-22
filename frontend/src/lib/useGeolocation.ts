import { useCallback, useState } from 'react'

export type GeolocationStatus = 'idle' | 'loading' | 'success' | 'denied' | 'error' | 'unsupported'

interface GeolocationState {
  status: GeolocationStatus
  latitude: number | null
  longitude: number | null
  /** Explicitly requests the browser's geolocation permission. Never
   * called automatically — only in response to the user choosing
   * "Use my location". */
  request: () => void
}

/**
 * Thin wrapper over the browser Geolocation API. Missing/denied location
 * is never treated as an error state the rest of the UI needs to react
 * to — the caller (job-browse distance filter) simply leaves distance
 * filtering off and lets the user continue browsing.
 */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeolocationStatus>('idle')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }

    setStatus('loading')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // WorkerProfile/EmployerProfile store coordinates to six decimal
        // places. Browser geolocation commonly returns 12–15 places, which
        // Django correctly rejects instead of silently truncating.
        setLatitude(Number(position.coords.latitude.toFixed(6)))
        setLongitude(Number(position.coords.longitude.toFixed(6)))
        setStatus('success')
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error')
      },
      { timeout: 10_000 },
    )
  }, [])

  return { status, latitude, longitude, request }
}

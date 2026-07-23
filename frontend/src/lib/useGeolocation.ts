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
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
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

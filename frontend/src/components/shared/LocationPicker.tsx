import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import { LocateFixed, Search, X } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { Button } from '@/components/primitives/Button'
import { LoadingIndicator } from '@/components/primitives/LoadingIndicator'
import { useGeolocation } from '@/lib/useGeolocation'
import {
  geoapifyTileUrl,
  isGeoapifyConfigured,
  NEPAL_DEFAULT_CENTER,
  reverseGeocode,
  searchPlaces,
  toFriendlyGeoapifyMessage,
} from '@/lib/geoapify'
import type { LocationSearchResult, LocationValue } from '@/types/location'

const SEARCH_DEBOUNCE_MS = 400
const MIN_QUERY_LENGTH = 3
const DEFAULT_ZOOM = 12
const SELECTED_ZOOM = 16

/**
 * Inline SVG pin (brand-primary #9a3412, matching --color-brand-primary)
 * instead of Leaflet's default marker image — sidesteps the well-known
 * "broken default icon" bundler issue entirely and gives a large,
 * high-contrast, unambiguous single marker (never a tiny default pin).
 * The `location-pin-marker` class's mount-in animation (index.css) plays
 * once when the marker first appears (`value` going from `null` to set)
 * and is skipped entirely under `prefers-reduced-motion` (global rule in
 * index.css) — react-leaflet re-positions an existing marker via
 * `setLatLng`, not by remounting it, so subsequent moves never replay it.
 */
const MARKER_ICON = divIcon({
  html: `<div class="location-pin-marker"><svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="#9a3412"/><circle cx="18" cy="18" r="7" fill="#ffffff"/></svg></div>`,
  className: '',
  iconSize: [36, 48],
  iconAnchor: [18, 48],
})

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error'

interface LocationPickerProps {
  /** The single source of truth for this picker — address and
   * coordinates always travel together, never as separate disconnected
   * state. `null` means no location has been chosen yet. */
  value: LocationValue | null
  onChange: (value: LocationValue | null) => void
  label: string
  description?: string
  /** Read-only mode — map and summary render, all controls are hidden. */
  disabled?: boolean
  /** Parent-form validation message (e.g. "Location is required"). */
  error?: string
  mapHeightClassName?: string
}

/**
 * Reusable Leaflet + Geoapify location picker. Search, map click, marker
 * drag, and "use my current location" are four different ways to reach
 * the exact same `commitPoint` path, so address/lat/lon are always
 * updated together through `onChange` — there is no route that sets one
 * without the others.
 */
export function LocationPicker({
  value,
  onChange,
  label,
  description,
  disabled = false,
  error,
  mapHeightClassName = 'h-64 sm:h-80',
}: LocationPickerProps) {
  const geolocation = useGeolocation()
  const geoapifyConfigured = isGeoapifyConfigured()

  const [map, setMap] = useState<LeafletMap | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LocationSearchResult[]>([])
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false)
  const [reverseGeocodeError, setReverseGeocodeError] = useState<string | null>(null)
  const [tileError, setTileError] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const searchAbortRef = useRef<AbortController | null>(null)
  const reverseAbortRef = useRef<AbortController | null>(null)
  const lastGeolocationCoordsRef = useRef<string | null>(null)
  const summaryHeadingRef = useRef<HTMLParagraphElement | null>(null)

  const searchId = useId()
  const searchHintId = useId()

  const initialCenter = useMemo<[number, number]>(() => {
    if (value) return [value.latitude, value.longitude]
    return [NEPAL_DEFAULT_CENTER.latitude, NEPAL_DEFAULT_CENTER.longitude]
    // Intentionally only read once — this is react-leaflet's *initial*,
    // uncontrolled map view. Later moves happen imperatively via `flyTo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const initialZoom = value ? SELECTED_ZOOM : DEFAULT_ZOOM

  const flyToPoint = useCallback(
    (latitude: number, longitude: number, zoom = SELECTED_ZOOM) => {
      map?.flyTo([latitude, longitude], zoom)
    },
    [map],
  )

  const commitPoint = useCallback(
    (latitude: number, longitude: number) => {
      reverseAbortRef.current?.abort()
      const controller = new AbortController()
      reverseAbortRef.current = controller

      setReverseGeocodeError(null)
      setIsReverseGeocoding(true)
      // Coordinates land immediately (marker moves right away); address
      // catches up once reverse geocoding resolves.
      onChange({ address: value?.address ?? '', latitude, longitude, placeId: null })

      reverseGeocode(latitude, longitude, { signal: controller.signal })
        .then((formatted) => {
          if (controller.signal.aborted) return
          onChange({ address: formatted, latitude, longitude, placeId: null })
          setAnnouncement(`Location selected: ${formatted}`)
        })
        .catch((geocodeError) => {
          if (controller.signal.aborted) return
          onChange({ address: 'Selected map location', latitude, longitude, placeId: null })
          setReverseGeocodeError(
            geocodeError instanceof DOMException && geocodeError.name === 'AbortError'
              ? null
              : "We couldn't look up an address for this point — the location is still saved.",
          )
          setAnnouncement('Location selected. Address lookup was unavailable.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsReverseGeocoding(false)
        })
    },
    [onChange, value?.address],
  )

  // --- map click -----------------------------------------------------
  useEffect(() => {
    if (!map || disabled) return

    const handleClick = (event: { latlng: { lat: number; lng: number } }) => {
      commitPoint(event.latlng.lat, event.latlng.lng)
    }

    map.on('click', handleClick)
    return () => {
      map.off('click', handleClick)
    }
  }, [map, disabled, commitPoint])

  // --- responsive resize (e.g. inside a tab/modal that starts hidden) -
  useEffect(() => {
    if (!map || typeof ResizeObserver === 'undefined') return

    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])

  // --- debounced, cancellable search ----------------------------------
  useEffect(() => {
    if (!geoapifyConfigured) return

    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setSearchStatus('idle')
      searchAbortRef.current?.abort()
      return
    }

    setSearchStatus('loading')

    const timer = setTimeout(() => {
      searchAbortRef.current?.abort()
      const controller = new AbortController()
      searchAbortRef.current = controller

      const center = map?.getCenter()
      const bias = center ? { latitude: center.lat, longitude: center.lng } : undefined

      searchPlaces(trimmed, { signal: controller.signal, bias })
        .then((found) => {
          if (controller.signal.aborted) return
          setResults(found)
          setSearchStatus(found.length > 0 ? 'success' : 'empty')
        })
        .catch((searchErr) => {
          if (controller.signal.aborted) return
          if (searchErr instanceof DOMException && searchErr.name === 'AbortError') return
          setSearchStatus('error')
          setSearchError(toFriendlyGeoapifyMessage(searchErr))
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, geoapifyConfigured, map])

  useEffect(
    () => () => {
      searchAbortRef.current?.abort()
      reverseAbortRef.current?.abort()
    },
    [],
  )

  const handleSelectResult = useCallback(
    (result: LocationSearchResult) => {
      onChange({
        address: result.formatted,
        latitude: result.latitude,
        longitude: result.longitude,
        placeId: result.placeId,
      })
      setQuery('')
      setResults([])
      setSearchStatus('idle')
      setReverseGeocodeError(null)
      setAnnouncement(`Location selected: ${result.formatted}`)
      flyToPoint(result.latitude, result.longitude)
      summaryHeadingRef.current?.focus()
    },
    [onChange, flyToPoint],
  )

  const handleClear = useCallback(() => {
    onChange(null)
    setReverseGeocodeError(null)
    setAnnouncement('Location cleared.')
  }, [onChange])

  // --- "use my current location" --------------------------------------
  useEffect(() => {
    if (geolocation.status !== 'success' || geolocation.latitude === null || geolocation.longitude === null) return

    const key = `${geolocation.latitude},${geolocation.longitude}`
    if (lastGeolocationCoordsRef.current === key) return
    lastGeolocationCoordsRef.current = key

    commitPoint(geolocation.latitude, geolocation.longitude)
    flyToPoint(geolocation.latitude, geolocation.longitude)
  }, [geolocation.status, geolocation.latitude, geolocation.longitude, commitPoint, flyToPoint])

  const markerPosition = value ? ([value.latitude, value.longitude] as [number, number]) : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{label}</h3>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </p>
      )}

      {!disabled && (
        <div className="flex flex-col gap-2">
          {geoapifyConfigured ? (
            <>
              <label htmlFor={searchId} className="text-base font-semibold text-text-primary">
                Search an area, landmark or address
              </label>
              <div className="relative">
                <Search
                  size={18}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                />
                <input
                  id={searchId}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault()
                  }}
                  placeholder="e.g. Baneshwor, Kathmandu"
                  className="min-h-touch w-full rounded-sm border border-text-secondary/30 bg-surface py-2 pl-10 pr-9 text-base text-text-primary focus:border-brand-primary"
                />
                {searchStatus === 'loading' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <LoadingIndicator size="sm" label="Searching" />
                  </span>
                )}
              </div>
            </>
          ) : (
            <p id={searchHintId} className="text-sm text-text-secondary">
              Search is unavailable right now — tap the map below or use your current location instead.
            </p>
          )}

          {searchStatus === 'error' && (
            <p role="status" className="text-sm text-danger-text">
              {searchError}
            </p>
          )}
          {searchStatus === 'empty' && (
            <p role="status" className="text-sm text-text-secondary">
              We could not find that place.
            </p>
          )}

          {results.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-text-secondary/20 bg-surface p-1 shadow-card">
              {results.map((result) => (
                <li key={result.placeId}>
                  <button
                    type="button"
                    onClick={() => handleSelectResult(result)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-sm px-3 py-2 text-left hover:bg-surface-muted"
                  >
                    <span className="text-base font-semibold text-text-primary">{result.primaryLabel}</span>
                    {result.secondaryLabel && (
                      <span className="text-sm text-text-secondary">{result.secondaryLabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={geolocation.request}
            isLoading={geolocation.status === 'loading'}
            className="self-start"
          >
            <LocateFixed size={18} aria-hidden="true" />
            Use my current location
          </Button>

          {geolocation.status === 'denied' && (
            <p role="status" className="text-sm text-text-secondary">
              Location permission was denied. You can still search or choose a point on the map.
            </p>
          )}
          {geolocation.status === 'error' && (
            <p role="status" className="text-sm text-text-secondary">
              We couldn't get your current location. You can still search or choose a point on the map.
            </p>
          )}
          {geolocation.status === 'unsupported' && (
            <p role="status" className="text-sm text-text-secondary">
              Your device doesn't support location. You can still search or choose a point on the map.
            </p>
          )}
          {geolocation.status === 'success' && geolocation.accuracy !== null && (
            <p className="text-sm text-text-secondary">
              Your device estimates this location within approximately {Math.round(geolocation.accuracy)} metres.
            </p>
          )}
        </div>
      )}

      <p className="text-sm text-text-secondary">
        Tap the map to choose a location. Drag the marker to adjust the exact place.
      </p>

      <div className="relative overflow-hidden rounded-md border border-text-secondary/20">
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          scrollWheelZoom
          className={`w-full ${mapHeightClassName}`}
          ref={setMap}
        >
          <TileLayer
            url={geoapifyTileUrl()}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | &copy; <a href="https://www.geoapify.com/">Geoapify</a>'
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          {markerPosition && (
            <Marker
              position={markerPosition}
              icon={MARKER_ICON}
              draggable={!disabled}
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = event.target.getLatLng()
                  commitPoint(lat, lng)
                },
              }}
            />
          )}
        </MapContainer>
        {tileError && (
          <p
            role="status"
            className="absolute bottom-2 left-2 right-2 rounded-sm bg-surface/90 px-2 py-1 text-xs text-text-secondary"
          >
            Map preview is temporarily unavailable — tapping and dragging still work.
          </p>
        )}
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-text-secondary/20 bg-surface-muted p-3">
        {value ? (
          <>
            <p ref={summaryHeadingRef} tabIndex={-1} className="text-base font-semibold text-text-primary">
              {isReverseGeocoding ? 'Finding address…' : value.address || 'Selected map location'}
            </p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-text-secondary sm:grid-cols-2">
              <div>
                <dt className="inline font-semibold">Latitude: </dt>
                <dd className="inline">{value.latitude.toFixed(6)}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Longitude: </dt>
                <dd className="inline">{value.longitude.toFixed(6)}</dd>
              </div>
            </dl>
            {reverseGeocodeError && (
              <p role="status" className="text-sm text-text-secondary">
                {reverseGeocodeError}
              </p>
            )}
            <p role="status" className="text-sm font-semibold text-success-text">
              Location selected.
            </p>
            {!disabled && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => flyToPoint(value.latitude, value.longitude)}>
                  Center map on this point
                </Button>
                <Button type="button" variant="secondary" onClick={handleClear}>
                  <X size={18} aria-hidden="true" />
                  Clear location
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            No location selected yet. Search above, use your current location, or tap the map.
          </p>
        )}
      </div>
    </div>
  )
}

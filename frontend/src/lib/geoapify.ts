import type { LocationSearchResult } from '@/types/location'

/**
 * Thin client over the three Geoapify endpoints `LocationPicker` needs:
 * autocomplete search, reverse geocoding, and (implicitly, via
 * `LocationPicker`'s `<TileLayer>`) raster map tiles. Deliberately has no
 * forward-geocode-by-address function — autocomplete results already
 * carry `lat`/`lon`, so selecting one never needs a second request.
 *
 * Every request is scoped to Nepal (`filter=countrycode:np`) and biased
 * toward the current map view so results feel locally relevant without
 * excluding the rest of the country.
 */

export type GeoapifyErrorKind = 'missing_key' | 'network' | 'quota' | 'auth' | 'invalid_response' | 'unknown'

export class GeoapifyError extends Error {
  kind: GeoapifyErrorKind

  constructor(kind: GeoapifyErrorKind, message: string) {
    super(message)
    this.name = 'GeoapifyError'
    this.kind = kind
  }
}

/** Kathmandu Valley — the application's existing default region
 * (see docs/DEVELOPMENT_SETUP.md demo data), used only as a proximity
 * bias/initial map center, never as a fallback coordinate for a saved
 * location (0,0 or any invented value is never returned as real data). */
export const NEPAL_DEFAULT_CENTER = { latitude: 27.7172, longitude: 85.324 }

const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete'
const REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse'
export const GEOAPIFY_TILE_URL_TEMPLATE =
  'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey={apiKey}'

const RESULT_LIMIT = 5

function apiKey(): string | undefined {
  return import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined
}

export function isGeoapifyConfigured(): boolean {
  return Boolean(apiKey())
}

export function geoapifyTileUrl(): string {
  return GEOAPIFY_TILE_URL_TEMPLATE.replace('{apiKey}', apiKey() ?? '')
}

// Session-lifetime caches only (never persisted) — cleared on full page
// reload, kept here (not component state) so they survive a
// LocationPicker unmount/remount within the same session.
const searchCache = new Map<string, LocationSearchResult[]>()
const reverseCache = new Map<string, string>()

function classifyResponseError(status: number): GeoapifyErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'quota'
  return 'unknown'
}

async function requestJson(
  url: string,
  params: URLSearchParams,
  signal: AbortSignal,
): Promise<{ results?: Array<Record<string, unknown>> }> {
  const key = apiKey()
  if (!key) {
    throw new GeoapifyError('missing_key', 'Geoapify API key is not configured.')
  }
  params.set('apiKey', key)

  let response: Response
  try {
    response = await fetch(`${url}?${params.toString()}`, { signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new GeoapifyError('network', 'Could not reach the location search service.')
  }

  if (!response.ok) {
    throw new GeoapifyError(
      classifyResponseError(response.status),
      `Geoapify request failed with status ${response.status}.`,
    )
  }

  try {
    return (await response.json()) as { results?: Array<Record<string, unknown>> }
  } catch {
    throw new GeoapifyError('invalid_response', 'Geoapify returned an unreadable response.')
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toSearchResult(props: Record<string, unknown>): LocationSearchResult | null {
  const latitude = props.lat
  const longitude = props.lon
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null

  const formatted = asString(props.formatted) ?? ''
  const primaryLabel =
    asString(props.name) ?? asString(props.address_line1) ?? asString(props.street) ?? (formatted || 'Unnamed place')
  const secondaryLabel =
    asString(props.address_line2) ??
    [asString(props.city) ?? asString(props.county), asString(props.state), asString(props.country)]
      .filter(Boolean)
      .join(', ')

  return {
    placeId: asString(props.place_id) ?? `${latitude},${longitude}`,
    primaryLabel,
    secondaryLabel,
    formatted: formatted || primaryLabel,
    latitude,
    longitude,
  }
}

export interface SearchPlacesOptions {
  signal: AbortSignal
  /** Biases results toward this point (typically the map's current
   * center) without excluding the rest of Nepal. Defaults to the
   * Kathmandu Valley. */
  bias?: { latitude: number; longitude: number }
}

/**
 * At least 3 meaningful characters (shorter queries return `[]` without a
 * request), at most 5 results, restricted to Nepal. Callers own
 * debouncing and `AbortController` lifecycle (see `LocationPicker`) —
 * this function itself makes exactly one request per call.
 */
export async function searchPlaces(query: string, options: SearchPlacesOptions): Promise<LocationSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const bias = options.bias ?? NEPAL_DEFAULT_CENTER
  const cacheKey = `${trimmed.toLowerCase()}|${bias.latitude.toFixed(2)},${bias.longitude.toFixed(2)}`
  const cached = searchCache.get(cacheKey)
  if (cached) return cached

  const params = new URLSearchParams({
    text: trimmed,
    filter: 'countrycode:np',
    bias: `proximity:${bias.longitude},${bias.latitude}`,
    limit: String(RESULT_LIMIT),
    format: 'json',
  })

  const data = await requestJson(AUTOCOMPLETE_URL, params, options.signal)
  const results = (data.results ?? [])
    .map(toSearchResult)
    .filter((result): result is LocationSearchResult => result !== null)
    .slice(0, RESULT_LIMIT)

  searchCache.set(cacheKey, results)
  return results
}

export interface ReverseGeocodeOptions {
  signal: AbortSignal
}

/**
 * Resolves a point to a formatted address string. Called only on map
 * click, marker dragend, or "use my current location" success — never on
 * every render, and never re-run for an unchanged saved value (the
 * caller is responsible for that; see `LocationPicker`).
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  options: ReverseGeocodeOptions,
): Promise<string> {
  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`
  const cached = reverseCache.get(cacheKey)
  if (cached !== undefined) return cached

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
  })

  const data = await requestJson(REVERSE_URL, params, options.signal)
  const formatted = asString(data.results?.[0]?.formatted)

  if (!formatted) {
    throw new GeoapifyError('invalid_response', 'No address was found for this location.')
  }

  reverseCache.set(cacheKey, formatted)
  return formatted
}

/** Never exposes the raw Geoapify/network error to the UI — every
 * message here is plain language, safe to show directly. */
export function toFriendlyGeoapifyMessage(error: unknown): string {
  if (error instanceof GeoapifyError) {
    switch (error.kind) {
      case 'missing_key':
      case 'auth':
        return 'Location search is not available right now.'
      case 'quota':
        return 'Location search is busy right now — please try again shortly.'
      case 'network':
        return 'Could not reach location search. You can still choose a point on the map.'
      case 'invalid_response':
      case 'unknown':
        return 'We could not complete that location search.'
    }
  }
  return 'We could not complete that location search.'
}

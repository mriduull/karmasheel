/**
 * The single controlled value `LocationPicker` (src/components/shared/
 * LocationPicker.tsx) owns and reports back through `onChange` — address
 * and coordinates always travel together as one value, never as
 * separate disconnected pieces of state. `placeId` is Geoapify's own
 * place identifier, kept only for potential future re-lookup; it is
 * never sent to the Django API (no matching field exists there).
 */
export interface LocationValue {
  address: string
  latitude: number
  longitude: number
  placeId?: string | null
}

/**
 * One Geoapify autocomplete suggestion, reduced to what the UI actually
 * renders — never the raw Geoapify JSON feature.
 */
export interface LocationSearchResult {
  placeId: string
  /** Short, human line — landmark/street/area name. */
  primaryLabel: string
  /** Locality/municipality/province/country context, comma-joined. */
  secondaryLabel: string
  /** Full formatted address, stored as `LocationValue.address` when picked. */
  formatted: string
  latitude: number
  longitude: number
}

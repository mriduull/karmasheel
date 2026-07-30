/**
 * Shared API-layer types. The backend never paginates list endpoints
 * (confirmed against every list view across the backend's views.py
 * files) — `ApiList<T>` exists so that assumption is written down once,
 * not re-invented per endpoint module.
 */
export type ApiList<T> = T[]

/**
 * 'network' — the browser itself reports no connectivity (`navigator.onLine
 * === false`); 'unreachable' — the request itself failed (connection
 * refused, DNS failure, CORS block, timeout) while the browser reports
 * being online, e.g. the backend is stopped or the request's origin isn't
 * in the backend's CORS_ALLOWED_ORIGINS. Kept distinct so the UI never
 * claims "you're offline" for a reachable-network, unreachable-server case.
 */
export type ApiErrorKind = 'network' | 'unreachable' | 'unauthorized' | 'forbidden' | 'validation' | 'server'

export interface ApiErrorShape {
  kind: ApiErrorKind
  status: number | null
  detail: string | null
  fieldErrors: Record<string, string[]> | null
}

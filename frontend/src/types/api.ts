/**
 * Shared API-layer types. The backend never paginates list endpoints
 * (confirmed against every list view across the backend's views.py
 * files) — `ApiList<T>` exists so that assumption is written down once,
 * not re-invented per endpoint module.
 */
export type ApiList<T> = T[]

export type ApiErrorKind = 'network' | 'unauthorized' | 'forbidden' | 'validation' | 'server'

export interface ApiErrorShape {
  kind: ApiErrorKind
  status: number | null
  detail: string | null
  fieldErrors: Record<string, string[]> | null
}

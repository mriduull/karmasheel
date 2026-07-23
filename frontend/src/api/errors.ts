import type { ApiErrorKind, ApiErrorShape } from '@/types/api'

/**
 * Normalized shape for every failure `apiFetch` can produce — the two DRF
 * error bodies (`{"detail": "..."}` and field-keyed arrays), a network
 * failure (no response at all), and everything else collapsed to `server`.
 */
export class ApiError extends Error implements ApiErrorShape {
  kind: ApiErrorKind
  status: number | null
  detail: string | null
  fieldErrors: Record<string, string[]> | null

  constructor(shape: ApiErrorShape) {
    super(shape.detail ?? `Request failed${shape.status ? ` (${shape.status})` : ''}`)
    this.name = 'ApiError'
    this.kind = shape.kind
    this.status = shape.status
    this.detail = shape.detail
    this.fieldErrors = shape.fieldErrors
  }
}

export function networkError(): ApiError {
  return new ApiError({ kind: 'network', status: null, detail: null, fieldErrors: null })
}

function splitErrorBody(body: unknown): {
  detail: string | null
  fieldErrors: Record<string, string[]> | null
} {
  if (!body || typeof body !== 'object') {
    return { detail: null, fieldErrors: null }
  }

  const record = body as Record<string, unknown>

  if (typeof record.detail === 'string') {
    return { detail: record.detail, fieldErrors: null }
  }

  const fieldErrors: Record<string, string[]> = {}
  let hasFieldErrors = false

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      fieldErrors[key] = value as string[]
      hasFieldErrors = true
    }
  }

  return { detail: null, fieldErrors: hasFieldErrors ? fieldErrors : null }
}

export async function parseErrorResponse(response: Response): Promise<ApiError> {
  let body: unknown = null

  try {
    body = await response.clone().json()
  } catch {
    body = null
  }

  const { detail, fieldErrors } = splitErrorBody(body)

  let kind: ApiErrorKind
  if (response.status === 401) kind = 'unauthorized'
  else if (response.status === 403) kind = 'forbidden'
  else if (response.status === 400) kind = 'validation'
  else kind = 'server'

  return new ApiError({ kind, status: response.status, detail, fieldErrors })
}

/**
 * Backend `detail`/field-error text is already plain English (per
 * FRONTEND_CONTEXT.md §12's examples) and is shown verbatim wherever it
 * exists — this only supplies wrapper copy for cases the backend can't
 * describe itself (network failure) and a last-resort generic fallback.
 * Page-specific components MAY still choose friendlier copy for a
 * particular known case (e.g. Login's own "that username or password
 * isn't right" message in Phase F1) instead of this generic banner text.
 */
export function toBannerMessage(error: ApiError): string {
  switch (error.kind) {
    case 'network':
      return "You appear to be offline — some actions won't work until you're back online."
    case 'unauthorized':
      return error.detail ?? 'Your session ended — please log in again.'
    case 'forbidden':
      return error.detail ?? "You don't have permission to do that."
    case 'validation':
      return error.detail ?? 'Please check the highlighted fields and try again.'
    case 'server':
    default:
      return error.detail ?? 'Something went wrong — please try again.'
  }
}

/** Flattens `fieldErrors` to one message per field, for `setError` in a form. */
export function toFieldErrors(error: ApiError): Record<string, string> | null {
  if (!error.fieldErrors) return null

  const flat: Record<string, string> = {}
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    if (messages[0]) flat[field] = messages[0]
  }
  return flat
}

import { useAuthStore } from '@/state/authStore'
import { tokenStorage } from './tokenStorage'
import { ApiError, networkError, parseErrorResponse } from './errors'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined

if (!API_BASE_URL) {
  // Fail loudly in dev/test rather than silently requesting a relative
  // "/api/..." path that can never reach the backend.
  // eslint-disable-next-line no-console
  console.error(
    'VITE_API_BASE_URL is not set. Copy frontend/.env.example to frontend/.env and set it.',
  )
}

const API_ROOT = `${API_BASE_URL ?? ''}/api`

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Skip attaching the Authorization header — register/login/refresh only. */
  isPublic?: boolean
  /** Internal — marks a call as the one allowed post-refresh retry. */
  _isRetry?: boolean
}

let refreshInFlight: Promise<string> | null = null

/**
 * Exchanges the stored refresh token for a new access token.
 *
 * Every caller — the app-boot bootstrap in routes/AuthBootstrap.tsx and
 * every concurrent 401 handled by `apiFetch` below — shares this single
 * `refreshInFlight` promise, so a burst of simultaneous 401s can never
 * fire more than one `POST /api/auth/token/refresh/` at a time.
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = performRefresh().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

async function performRefresh(): Promise<string> {
  const refreshToken = tokenStorage.getRefreshToken()

  if (!refreshToken) {
    throw networkError()
  }

  let response: Response
  try {
    response = await fetch(`${API_ROOT}/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    })
  } catch {
    throw networkError()
  }

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const data = (await response.json()) as { access: string }
  useAuthStore.getState().setAccessToken(data.access)
  return data.access
}

async function parseSuccessResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  if (contentType.includes('application/pdf')) {
    return (await response.blob()) as T
  }

  // text/html (CV preview) and any other text-ish body.
  return (await response.text()) as T
}

/**
 * Shared request function for every endpoint module — issues the request,
 * attaches auth, and handles the one-refresh-and-retry mutex on a 401.
 * Returns the raw, successful `Response` so callers can read it as JSON,
 * text, or a blob as appropriate (`apiFetch` below is the common JSON/text/
 * PDF case; `src/api/endpoints/profiles.ts`'s CV-PDF download uses this
 * directly since it also needs the `Content-Disposition` filename header,
 * which `apiFetch`'s parsed return value discards).
 */
export async function apiFetchRaw(path: string, options: RequestOptions = {}): Promise<Response> {
  const { body, isPublic, _isRetry, headers, ...rest } = options
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const finalHeaders = new Headers(headers)
  if (body !== undefined && !isFormData && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }
  if (!isPublic) {
    const accessToken = useAuthStore.getState().accessToken
    if (accessToken) {
      finalHeaders.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  let response: Response
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    })
  } catch {
    throw networkError()
  }

  if (response.ok) {
    return response
  }

  if (response.status === 401 && !isPublic) {
    if (!_isRetry) {
      try {
        await refreshAccessToken()
      } catch {
        useAuthStore.getState().logout()
        throw await parseErrorResponse(response)
      }

      // Retry exactly once, with the freshly-stored access token.
      return apiFetchRaw(path, { ...options, _isRetry: true })
    }

    // Already retried once with a supposedly-fresh token and still
    // unauthorized — the session is invalid, not transiently expired.
    // Log out rather than attempting another refresh (which would loop).
    useAuthStore.getState().logout()
  }

  throw await parseErrorResponse(response)
}

/**
 * Shared request function for every endpoint module. Backend list
 * endpoints are never paginated (see types/api.ts:ApiList) — this
 * function returns whatever JSON the backend sends with no `results`
 * unwrapping assumed.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetchRaw(path, options)
  return parseSuccessResponse<T>(response)
}

export { ApiError }

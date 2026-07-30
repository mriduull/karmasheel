import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { resetAuthStore } from '@/test/utils'
import { apiFetch } from './client'
import { useAuthStore } from '@/state/authStore'
import { tokenStorage } from './tokenStorage'

describe('apiFetch', () => {
  beforeEach(() => {
    resetAuthStore()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('attaches the access token to authenticated requests', async () => {
    useAuthStore.setState({ accessToken: 'my-token' })
    let seenAuthHeader: string | null = null

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, ({ request }) => {
        seenAuthHeader = request.headers.get('authorization')
        return HttpResponse.json({ ok: true })
      }),
    )

    await apiFetch('/profiles/worker/me/')

    expect(seenAuthHeader).toBe('Bearer my-token')
  })

  it('does not attach a token to public requests', async () => {
    useAuthStore.setState({ accessToken: 'my-token' })
    let seenAuthHeader: string | null = 'not-checked'

    server.use(
      http.post(`${API_ROOT}/auth/register/`, ({ request }) => {
        seenAuthHeader = request.headers.get('authorization')
        return HttpResponse.json({ ok: true }, { status: 201 })
      }),
    )

    await apiFetch('/auth/register/', { method: 'POST', body: {}, isPublic: true })

    expect(seenAuthHeader).toBeNull()
  })

  it('performs exactly one silent refresh and retries the original request once on a 401', async () => {
    tokenStorage.setRefreshToken('stored-refresh-token')
    useAuthStore.setState({ accessToken: 'expired-token' })

    let refreshCallCount = 0
    let protectedCallCount = 0

    server.use(
      http.post(`${API_ROOT}/auth/token/refresh/`, () => {
        refreshCallCount += 1
        return HttpResponse.json({ access: 'brand-new-token' })
      }),
      http.get(`${API_ROOT}/applications/`, ({ request }) => {
        protectedCallCount += 1
        const auth = request.headers.get('authorization')
        if (auth === 'Bearer brand-new-token') {
          return HttpResponse.json([{ id: 1 }])
        }
        return HttpResponse.json(
          { detail: 'Authentication credentials were not provided.' },
          { status: 401 },
        )
      }),
    )

    const result = await apiFetch('/applications/')

    expect(result).toEqual([{ id: 1 }])
    expect(refreshCallCount).toBe(1)
    expect(protectedCallCount).toBe(2)
    expect(useAuthStore.getState().accessToken).toBe('brand-new-token')
  })

  it('shares a single refresh call across simultaneous 401s (no competing refresh requests)', async () => {
    tokenStorage.setRefreshToken('stored-refresh-token')
    useAuthStore.setState({ accessToken: 'expired-token' })

    let refreshCallCount = 0

    server.use(
      http.post(`${API_ROOT}/auth/token/refresh/`, async () => {
        refreshCallCount += 1
        await new Promise((resolve) => setTimeout(resolve, 20))
        return HttpResponse.json({ access: 'brand-new-token' })
      }),
      http.get(`${API_ROOT}/jobs/`, ({ request }) => {
        const auth = request.headers.get('authorization')
        if (auth === 'Bearer brand-new-token') {
          return HttpResponse.json([])
        }
        return HttpResponse.json(
          { detail: 'Authentication credentials were not provided.' },
          { status: 401 },
        )
      }),
    )

    await Promise.all([apiFetch('/jobs/'), apiFetch('/jobs/'), apiFetch('/jobs/')])

    expect(refreshCallCount).toBe(1)
  })

  it('logs the user out when the refresh call itself fails', async () => {
    tokenStorage.setRefreshToken('stale-refresh-token')
    useAuthStore.setState({
      accessToken: 'expired-token',
      user: {
        id: 1,
        username: 'demo_worker_ramesh',
        email: 'x@example.com',
        phone_number: '9811100011',
        role: 'WORKER',
        is_contact_verified: true,
      },
    })

    server.use(
      http.post(`${API_ROOT}/auth/token/refresh/`, () =>
        HttpResponse.json({ detail: 'Token is invalid or expired' }, { status: 401 }),
      ),
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json(
          { detail: 'Authentication credentials were not provided.' },
          { status: 401 },
        ),
      ),
    )

    await expect(apiFetch('/applications/')).rejects.toMatchObject({ kind: 'unauthorized' })

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(tokenStorage.getRefreshToken()).toBeNull()
  })

  it('does not loop refreshing when the retried request is still unauthorized', async () => {
    tokenStorage.setRefreshToken('stored-refresh-token')
    useAuthStore.setState({ accessToken: 'expired-token' })

    let refreshCallCount = 0
    let protectedCallCount = 0

    server.use(
      http.post(`${API_ROOT}/auth/token/refresh/`, () => {
        refreshCallCount += 1
        return HttpResponse.json({ access: 'still-rejected-token' })
      }),
      http.get(`${API_ROOT}/applications/`, () => {
        protectedCallCount += 1
        return HttpResponse.json(
          { detail: 'Given token not valid for any token type' },
          { status: 401 },
        )
      }),
    )

    await expect(apiFetch('/applications/')).rejects.toMatchObject({ kind: 'unauthorized' })

    // Exactly one refresh attempt, exactly one retry — never an unbounded loop.
    expect(refreshCallCount).toBe(1)
    expect(protectedCallCount).toBe(2)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('classifies a fetch failure while the browser reports being online as "unreachable" — never claims the user is offline for a stopped/unreachable server', async () => {
    // jsdom's default navigator.onLine is true, matching the real-world
    // common case: the backend is down or CORS-blocked while the user's
    // own network connection is fine.
    server.use(http.get(`${API_ROOT}/taxonomy/categories/`, () => HttpResponse.error()))

    await expect(apiFetch('/taxonomy/categories/', { isPublic: true })).rejects.toMatchObject({
      kind: 'unreachable',
    })
  })

  it('classifies a fetch failure as "network" (offline) only when the browser itself reports no connectivity', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    server.use(http.get(`${API_ROOT}/taxonomy/categories/`, () => HttpResponse.error()))

    await expect(apiFetch('/taxonomy/categories/', { isPublic: true })).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('classifies 403 as forbidden, 400 as validation with field errors, and 5xx as server', async () => {
    server.use(
      http.post(`${API_ROOT}/jobs/`, () =>
        HttpResponse.json(
          { detail: 'Only verified employers can perform this action.' },
          { status: 403 },
        ),
      ),
    )
    await expect(apiFetch('/jobs/', { method: 'POST', body: {} })).rejects.toMatchObject({
      kind: 'forbidden',
    })

    server.use(
      http.post(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(
          { pan_vat_number: ['This PAN/VAT number is already registered.'] },
          { status: 400 },
        ),
      ),
    )
    await expect(
      apiFetch('/profiles/employer/me/', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      kind: 'validation',
      fieldErrors: { pan_vat_number: ['This PAN/VAT number is already registered.'] },
    })

    server.use(
      http.get(`${API_ROOT}/jobs/999/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )
    await expect(apiFetch('/jobs/999/')).rejects.toMatchObject({ kind: 'server' })
  })

  it('does not assume a paginated response — returns the raw array as-is', async () => {
    server.use(
      http.get(`${API_ROOT}/taxonomy/categories/`, () =>
        HttpResponse.json([{ id: 1, name: 'Construction & Repair' }]),
      ),
    )

    const result = await apiFetch('/taxonomy/categories/', { isPublic: true })

    expect(result).toEqual([{ id: 1, name: 'Construction & Repair' }])
  })
})

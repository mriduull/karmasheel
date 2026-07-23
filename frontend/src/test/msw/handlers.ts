import { http, HttpResponse } from 'msw'

export const API_ROOT = `${import.meta.env.VITE_API_BASE_URL}/api`

/**
 * Baseline handlers used by default in every test (via src/test/setup.ts).
 * Individual tests override specific routes with `server.use(...)` for
 * their own scenario (401s, validation errors, network failures, etc.).
 */
export const handlers = [
  http.get(`${API_ROOT}/auth/me/`, () =>
    HttpResponse.json({
      id: 1,
      username: 'demo_worker_ramesh',
      email: 'demo_worker_ramesh@example.com',
      phone_number: '9811100011',
      role: 'WORKER',
      is_contact_verified: true,
    }),
  ),
  http.post(`${API_ROOT}/auth/token/refresh/`, () =>
    HttpResponse.json({ access: 'refreshed-access-token' }),
  ),
  http.post(`${API_ROOT}/auth/logout/`, () => new HttpResponse(null, { status: 204 })),
]

import { http, HttpResponse } from 'msw'
import { buildEmployerProfileFixture } from '@/test/fixtures'

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
  // Default: no existing rating. `RateEngagementButton` fires this for
  // every COMPLETED application row (Worker Applications, Employer Job
  // Applications) — tests unrelated to ratings that happen to render a
  // COMPLETED fixture rely on this default rather than each defining its
  // own handler.
  http.get(`${API_ROOT}/applications/:id/rating/`, () => HttpResponse.json([])),
  // Default: a verified employer profile. `useEmployerVerificationStatus`
  // is now read by more components than just the screens that already
  // mock this explicitly (e.g. EmployerJobDetail's Recommended Workers
  // link) — tests that don't care about verification status rely on this
  // default; tests that do (Dashboard, Jobs, EmployerLayout, etc.) already
  // override it per-scenario via `server.use(...)`, which always wins.
  http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
]

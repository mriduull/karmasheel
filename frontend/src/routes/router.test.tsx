import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import {
  buildEmployerJobFixture,
  buildEmployerProfileFixture,
  buildWorkerProfileFixture,
  buildWorkerRecommendationFixture,
} from '@/test/fixtures'
import { routeConfig } from './router'
import {
  createTestQueryClient,
  mockWindowLocationAssign,
  resetAuthStore,
  setAuthenticatedUser,
} from '@/test/utils'
import { useAuthStore } from '@/state/authStore'
import type { CurrentUser } from '@/types/user'

const WORKER_USER: CurrentUser = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER',
  is_contact_verified: true,
}

const EMPLOYER_USER: CurrentUser = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER',
  is_contact_verified: true,
}

function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(routeConfig, { initialEntries: [path] })
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={memoryRouter} />
    </QueryClientProvider>,
  )
}

describe('router', () => {
  beforeEach(() => {
    resetAuthStore()
    server.use(
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([])),
    )
  })

  it('renders the public landing page at /', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Workforce Match' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: /find honest local work/i }),
    ).toBeInTheDocument()
  })

  it('renders the 404 page for an unknown path', () => {
    renderAt('/this-route-does-not-exist')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('redirects /worker to the login page for an unauthenticated visitor', () => {
    renderAt('/worker')
    expect(screen.getByRole('heading', { name: 'Log In' })).toBeInTheDocument()
  })

  it.each(['/worker', '/worker/profile', '/worker/applications'])(
    'redirects an unauthenticated visitor away from %s to Login',
    (path) => {
      renderAt(path)
      expect(screen.getByRole('heading', { name: 'Log In' })).toBeInTheDocument()
    },
  )

  it('renders the real worker dashboard for an authenticated worker', async () => {
    setAuthenticatedUser(WORKER_USER)
    renderAt('/worker')
    expect(await screen.findByRole('heading', { name: /welcome, demo_worker_electrician/i })).toBeInTheDocument()
  })

  it.each(['/worker', '/worker/profile', '/worker/applications'])(
    'redirects an authenticated Employer away from the Worker route %s to /employer',
    async (path) => {
      setAuthenticatedUser(EMPLOYER_USER)
      renderAt(path)
      expect(
        await screen.findByRole('heading', { name: /welcome, demo_employer_verified/i }),
      ).toBeInTheDocument()
    },
  )

  it('renders public Job Browse and Job Detail routes', () => {
    renderAt('/jobs')
    expect(screen.getByRole('heading', { name: 'Browse Jobs' })).toBeInTheDocument()

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () =>
        HttpResponse.json({ detail: 'Job not found.' }, { status: 404 }),
      ),
    )
    renderAt('/jobs/5')
  })

  it('Worker navigation exposes all eight real Worker destinations (F2 + F4), no dead links', async () => {
    setAuthenticatedUser(WORKER_USER)
    renderAt('/worker')
    await screen.findByRole('heading', { name: /welcome/i })

    // A single "Primary" landmark (desktop and tablet item sets share it,
    // per the no-duplicate-landmarks fix — both variants' links exist in
    // the DOM at once in jsdom, only one visible per real breakpoint), so
    // compare the unique set of hrefs rather than an exact-order array.
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = nav.querySelectorAll('a')
    const hrefs = new Set(Array.from(links).map((link) => link.getAttribute('href')))

    expect(hrefs).toEqual(
      new Set([
        '/worker',
        '/jobs',
        '/worker/applications',
        '/worker/recommendations',
        '/worker/opportunities',
        '/worker/profile',
        '/worker/cv',
        '/worker/ratings',
      ]),
    )
  })

  it('logout from a Worker-guarded route requests a hard navigation to the public landing page, not /login', async () => {
    setAuthenticatedUser(WORKER_USER)
    server.use(http.post(`${API_ROOT}/auth/logout/`, () => new HttpResponse(null, { status: 204 })))

    // A full page load (`window.location.assign`), not client-side
    // navigate() — see NavShell.tsx's handleLogout for why: RequireRole's
    // own reactive "user just became null, route is still mounted"
    // redirect to /login empirically wins any client-side-navigation race
    // (verified — neither call ordering nor flushSync could beat it,
    // since React Router resolves the transition via a concurrent
    // `startTransition` that can't be forced to commit synchronously).
    const { assignSpy, restore } = mockWindowLocationAssign()

    const user = userEvent.setup()
    renderAt('/worker')
    await screen.findByRole('heading', { name: /welcome/i })

    await user.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/'))
    expect(useAuthStore.getState().user).toBeNull()

    restore()
  })

  it('a verified employer reaches the real per-job Recommended Workers page', async () => {
    setAuthenticatedUser(EMPLOYER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/recommendations/jobs/5/workers/`, () =>
        HttpResponse.json([buildWorkerRecommendationFixture()]),
      ),
    )

    renderAt('/employer/jobs/5/recommendations')

    expect(await screen.findByText('demo_worker_electrician')).toBeInTheDocument()
  })

  it('a PENDING employer is blocked from the per-job Recommended Workers page with a plain explanation, not a raw 403', async () => {
    setAuthenticatedUser(EMPLOYER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'PENDING' })),
      ),
    )

    renderAt('/employer/jobs/5/recommendations')

    expect(await screen.findByRole('heading', { name: 'Not available' })).toBeInTheDocument()
    expect(screen.getByText(/an administrator reviews new employer accounts/i)).toBeInTheDocument()
  })

  it('a Worker cannot reach an employer-only recommendation route — redirected to their own dashboard', async () => {
    setAuthenticatedUser(WORKER_USER)

    renderAt('/employer/jobs/5/recommendations')

    expect(await screen.findByRole('heading', { name: /welcome, demo_worker_electrician/i })).toBeInTheDocument()
  })

  it.each(['/worker/recommendations', '/worker/opportunities', '/worker/cv', '/worker/ratings'])(
    'an Employer cannot reach the Worker-only route %s — redirected to their own dashboard',
    async (path) => {
      setAuthenticatedUser(EMPLOYER_USER)
      renderAt(path)

      expect(
        await screen.findByRole('heading', { name: /welcome, demo_employer_verified/i }),
      ).toBeInTheDocument()
    },
  )

  it.each(['/worker/recommendations', '/worker/opportunities', '/worker/cv', '/worker/ratings'])(
    'redirects an unauthenticated visitor away from %s to Login',
    (path) => {
      renderAt(path)
      expect(screen.getByRole('heading', { name: 'Log In' })).toBeInTheDocument()
    },
  )

  it('does not include any route for an unsupported feature (password reset, chat, etc.)', () => {
    const definedPaths = routeConfig.flatMap((route) =>
      'children' in route && route.children ? route.children.map((child) => child.path) : [route.path],
    )

    for (const unsupported of [
      '/password-reset',
      '/forgot-password',
      '/chat',
      '/messages',
      '/payments',
      '/notifications',
      '/complaints',
      '/map',
      // No endpoint aggregates applications across jobs
      // (docs/FRONTEND_IMPLEMENTATION_PLAN.md correction #4) — the only
      // entry point is a specific owned job's Applications page.
      '/employer/applicants',
      // No public worker directory/profile page exists anywhere.
      '/workers',
    ]) {
      expect(definedPaths).not.toContain(unsupported)
    }
  })

  it('Phase F4 routes exist: worker Recommendations/Opportunities/CV/Ratings, employer per-job Candidates/Recommendations, employer Ratings', () => {
    const definedPaths = routeConfig.flatMap((route) =>
      'children' in route && route.children ? route.children.map((child) => child.path) : [route.path],
    )

    for (const supported of [
      '/worker/recommendations',
      '/worker/opportunities',
      '/worker/cv',
      '/worker/ratings',
      '/employer/jobs/:id/candidates',
      '/employer/jobs/:id/recommendations',
      '/employer/ratings',
    ]) {
      expect(definedPaths).toContain(supported)
    }
  })
})

import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { buildEmployerProfileFixture, buildWorkerProfileFixture } from '@/test/fixtures'
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
  username: 'demo_worker_ramesh',
  email: 'ramesh@example.com',
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
    expect(await screen.findByRole('heading', { name: /welcome, demo_worker_ramesh/i })).toBeInTheDocument()
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

  it('Worker navigation exposes exactly the four F2 destinations, no F4 placeholders', async () => {
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

    expect(hrefs).toEqual(new Set(['/worker', '/jobs', '/worker/applications', '/worker/profile']))
    // No misleading links to unfinished F4 screens (recommendations,
    // opportunity advisory, CV, ratings).
    for (const unsupported of ['/worker/recommendations', '/worker/opportunities', '/worker/cv', '/worker/ratings']) {
      expect(hrefs).not.toContain(unsupported)
    }
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
      '/employer/applicants',
      '/worker/recommendations',
      '/worker/opportunities',
      '/worker/cv',
      '/worker/ratings',
    ]) {
      expect(definedPaths).not.toContain(unsupported)
    }
  })
})

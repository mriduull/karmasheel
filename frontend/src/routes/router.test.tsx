import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { routeConfig } from './router'
import { createTestQueryClient, resetAuthStore, setAuthenticatedUser } from '@/test/utils'

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

  it('renders the worker dashboard placeholder for an authenticated worker', () => {
    setAuthenticatedUser({
      id: 1,
      username: 'demo_worker_ramesh',
      email: 'ramesh@example.com',
      phone_number: '9811100011',
      role: 'WORKER',
      is_contact_verified: true,
    })
    renderAt('/worker')
    expect(screen.getByRole('heading', { name: 'Worker Dashboard' })).toBeInTheDocument()
  })

  it('renders public Job Browse and Job Detail routes added in Phase F1', () => {
    renderAt('/jobs')
    expect(screen.getByRole('heading', { name: 'Browse Jobs' })).toBeInTheDocument()

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () =>
        HttpResponse.json({ detail: 'Job not found.' }, { status: 404 }),
      ),
    )
    renderAt('/jobs/5')
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
    ]) {
      expect(definedPaths).not.toContain(unsupported)
    }
  })
})

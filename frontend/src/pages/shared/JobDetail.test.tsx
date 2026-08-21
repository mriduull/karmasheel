import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { createTestQueryClient, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildApplicationFixture, buildJobFixture } from '@/test/fixtures'
import { JobDetail } from './JobDetail'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from
  return <p>login-page: from={from?.pathname ?? 'none'}</p>
}

function renderJobDetail(route: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/jobs" element={<p>browse-page</p>} />
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/worker/applications" element={<p>applications-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('JobDetail', () => {
  beforeEach(() => {
    resetAuthStore()
  })

  it('renders title, status, employer, description, and skills from the real public serializer shape', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5 }))),
    )

    renderJobDetail('/jobs/5')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'House Wiring for New Apartment Block' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Kathmandu Home Services Pvt. Ltd.')).toBeInTheDocument()
    expect(screen.getByText('Verified employer')).toBeInTheDocument()
    expect(screen.getByText('Rs. 1,300 / day')).toBeInTheDocument()
    expect(screen.getByText('House Wiring')).toBeInTheDocument()
    expect(screen.getByText('Electrical Repair')).toBeInTheDocument()
  })

  it('shows a "Log in as a worker to apply" link that preserves this job as the post-login destination', async () => {
    server.use(http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5 }))))

    const user = userEvent.setup()
    renderJobDetail('/jobs/5')

    const loginLink = await screen.findByRole('link', { name: 'Log in as a worker' })
    expect(loginLink).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: /^apply$/i })).not.toBeInTheDocument()

    await user.click(loginLink)
    expect(await screen.findByText('login-page: from=/jobs/5')).toBeInTheDocument()
  })

  it('handles a 404 (not found / inactive) as "job unavailable", with a back-to-browse action', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/999/`, () =>
        HttpResponse.json({ detail: 'Job not found.' }, { status: 404 }),
      ),
    )

    renderJobDetail('/jobs/999')

    expect(await screen.findByText("This job isn't available anymore")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Browse' })).toHaveAttribute('href', '/jobs')
  })

  it('shows Apply for an authenticated Worker on an eligible active job', async () => {
    setAuthenticatedUser(WORKER_USER)
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5, status: 'ACTIVE' }))),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderJobDetail('/jobs/5')

    expect(await screen.findByRole('button', { name: 'Apply' })).toBeInTheDocument()
  })

  it('shows no Apply action for an inactive (closed) job', async () => {
    setAuthenticatedUser(WORKER_USER)
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5, status: 'CLOSED' }))),
    )

    renderJobDetail('/jobs/5')

    expect(await screen.findByText('This job is no longer accepting applications.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })

  it('submits a successful application with the exact request fields and shows a confirmation', async () => {
    setAuthenticatedUser(WORKER_USER)
    let capturedBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5, status: 'ACTIVE' }))),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
      http.post(`${API_ROOT}/applications/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(buildApplicationFixture({ id: 9, job: 5 }), { status: 201 })
      }),
    )

    const user = userEvent.setup()
    renderJobDetail('/jobs/5')

    await user.type(await screen.findByLabelText(/note to the employer/i), 'Available from Monday')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(capturedBody).toEqual({ job: 5, worker_note: 'Available from Monday' })
    })
    expect(await screen.findByText('Application sent.')).toBeInTheDocument()
  })

  it('prevents a duplicate click from submitting the application twice', async () => {
    setAuthenticatedUser(WORKER_USER)
    let callCount = 0

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5, status: 'ACTIVE' }))),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
      http.post(`${API_ROOT}/applications/`, async () => {
        callCount += 1
        await new Promise((resolve) => setTimeout(resolve, 40))
        return HttpResponse.json(buildApplicationFixture({ id: 9, job: 5 }), { status: 201 })
      }),
    )

    const user = userEvent.setup()
    renderJobDetail('/jobs/5')

    const applyButton = await screen.findByRole('button', { name: 'Apply' })
    await user.click(applyButton)
    // Button is disabled the instant submission starts — a second click
    // on the same element cannot fire another request.
    expect(applyButton).toBeDisabled()

    await waitFor(() => expect(screen.getByText('Application sent.')).toBeInTheDocument())
    expect(callCount).toBe(1)
  })

  it('handles a duplicate-application (already applied) response safely, even with stale local state', async () => {
    setAuthenticatedUser(WORKER_USER)

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5, status: 'ACTIVE' }))),
      // Stale local cache: nothing shows as applied yet...
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
      http.post(`${API_ROOT}/applications/`, () =>
        HttpResponse.json({ job: ['You have already applied to this job.'] }, { status: 400 }),
      ),
    )

    const user = userEvent.setup()
    renderJobDetail('/jobs/5')

    await user.click(await screen.findByRole('button', { name: 'Apply' }))

    expect(await screen.findByText('You have already applied to this job.')).toBeInTheDocument()
  })

  it('replaces Apply with the existing status when the frontend already knows the worker applied', async () => {
    setAuthenticatedUser(WORKER_USER)
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5, status: 'ACTIVE' }))),
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 9, job: 5, status: 'SHORTLISTED' })]),
      ),
    )

    renderJobDetail('/jobs/5')

    expect(await screen.findByText('You applied to this job.')).toBeInTheDocument()
    expect(screen.getByText('Shortlisted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5 }))))

    const { container } = renderJobDetail('/jobs/5')
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'House Wiring for New Apartment Block' }),
      ).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

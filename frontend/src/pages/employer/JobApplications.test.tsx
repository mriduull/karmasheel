import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildApplicationFixture, buildEmployerJobFixture } from '@/test/fixtures'
import { EmployerJobApplications } from './JobApplications'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/employer/jobs/:id" element={<p>OWNER JOB DETAIL PAGE</p>} />
      <Route path="/employer/jobs/:id/applications" element={<EmployerJobApplications />} />
    </Routes>,
    { route: `/employer/jobs/${id}/applications` },
  )
}

describe('EmployerJobApplications', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it('shows the job title as context and renders one card per application (bare array)', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([
          buildApplicationFixture({ id: 1, worker_username: 'demo_worker_ramesh' }),
          buildApplicationFixture({ id: 2, worker_username: 'demo_worker_sita' }),
        ]),
      ),
    )

    renderAt('5')

    expect(await screen.findByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    expect(screen.getByText('demo_worker_ramesh')).toBeInTheDocument()
    expect(screen.getByText('demo_worker_sita')).toBeInTheDocument()
  })

  it('shows worker/employer notes only where present, with the employer-perspective status label', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([
          buildApplicationFixture({
            id: 1,
            status: 'CANCELLED',
            worker_note: 'Available weekends only',
            employer_note: '',
          }),
        ]),
      ),
    )

    renderAt('5')

    expect(await screen.findByText(/available weekends only/i)).toBeInTheDocument()
    // Employer-perspective phrasing, not the Worker-perspective default.
    expect(screen.getByText('Cancelled by you')).toBeInTheDocument()
  })

  it('renders only the legal transition actions for the current status', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 1, status: 'APPLIED' })]),
      ),
    )

    renderAt('5')
    await screen.findByText('demo_worker_ramesh')

    expect(screen.getByRole('button', { name: 'Shortlist' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hire' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark Completed' })).not.toBeInTheDocument()
  })

  it('submits a forward-progress transition directly, without a confirmation dialog', async () => {
    const user = userEvent.setup()
    let patchBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 1, status: 'APPLIED' })]),
      ),
      http.patch(`${API_ROOT}/applications/1/status/`, async ({ request }) => {
        patchBody = await request.json()
        return HttpResponse.json(buildApplicationFixture({ id: 1, status: 'SHORTLISTED' }))
      }),
    )

    renderAt('5')
    await user.click(await screen.findByRole('button', { name: 'Shortlist' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(patchBody).toEqual({ status: 'SHORTLISTED' }))
    expect(await screen.findByText('Shortlisted')).toBeInTheDocument()
  })

  it('requires confirmation before Reject, and does nothing if cancelled', async () => {
    const user = userEvent.setup()
    let patchCalled = false

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 1, status: 'APPLIED' })]),
      ),
      http.patch(`${API_ROOT}/applications/1/status/`, () => {
        patchCalled = true
        return HttpResponse.json(buildApplicationFixture({ id: 1, status: 'REJECTED' }))
      }),
    )

    renderAt('5')
    await user.click(await screen.findByRole('button', { name: 'Reject' }))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Go back' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(patchCalled).toBe(false)
    expect(screen.getByText('Applied')).toBeInTheDocument()
  })

  it('shows a plain-language race error inside the dialog when the status changed server-side', async () => {
    const user = userEvent.setup()

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 1, status: 'APPLIED' })]),
      ),
      http.patch(`${API_ROOT}/applications/1/status/`, () =>
        HttpResponse.json({ detail: 'Cannot transition application from WITHDRAWN to REJECTED.' }, { status: 400 }),
      ),
    )

    renderAt('5')
    await user.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(
      await within(dialog).findByText('Cannot transition application from WITHDRAWN to REJECTED.'),
    ).toBeInTheDocument()
  })

  it('shows the no-applications empty state', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => HttpResponse.json([])),
    )

    renderAt('5')

    expect(await screen.findByText('No applications yet for this job')).toBeInTheDocument()
  })

  it('filters applications client-side by status group', async () => {
    const user = userEvent.setup()

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([
          buildApplicationFixture({ id: 1, worker_username: 'new_applicant', status: 'APPLIED' }),
          buildApplicationFixture({ id: 2, worker_username: 'hired_worker', status: 'HIRED' }),
          buildApplicationFixture({ id: 3, worker_username: 'rejected_worker', status: 'REJECTED' }),
        ]),
      ),
    )

    renderAt('5')
    await screen.findByText('new_applicant')

    await user.click(screen.getByRole('tab', { name: 'New' }))
    expect(screen.getByText('new_applicant')).toBeInTheDocument()
    expect(screen.queryByText('hired_worker')).not.toBeInTheDocument()
    expect(screen.queryByText('rejected_worker')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Closed out' }))
    expect(screen.queryByText('new_applicant')).not.toBeInTheDocument()
    expect(screen.getByText('rejected_worker')).toBeInTheDocument()
  })

  it('shows a retryable error state', async () => {
    let callCount = 0
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        return HttpResponse.json([buildApplicationFixture({ id: 1 })])
      }),
    )

    const user = userEvent.setup()
    renderAt('5')

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('demo_worker_ramesh')).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 1, status: 'APPLIED' })]),
      ),
    )

    const { container } = renderAt('5')
    await waitFor(() => {
      expect(screen.getByText('demo_worker_ramesh')).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

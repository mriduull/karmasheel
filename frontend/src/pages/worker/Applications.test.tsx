import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildApplicationFixture, buildRatingFixture } from '@/test/fixtures'
import type { ApplicationStatus } from '@/types/application'
import { WorkerApplications } from './Applications'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_ramesh',
  email: 'ramesh@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  CONTACTED: 'Contacted',
  HIRED: 'Hired',
  COMPLETED: 'Completed',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn by you',
  CANCELLED: 'Cancelled by employer',
}

const WITHDRAWABLE: ApplicationStatus[] = ['APPLIED', 'SHORTLISTED', 'CONTACTED']
const NOT_WITHDRAWABLE: ApplicationStatus[] = ['HIRED', 'COMPLETED', 'REJECTED', 'WITHDRAWN', 'CANCELLED']

describe('WorkerApplications', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
  })

  it('treats the response as a bare array and renders one row per application', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([
          buildApplicationFixture({ id: 1, job_title: 'House Wiring Job' }),
          buildApplicationFixture({ id: 2, job_title: 'Deep Cleaning Job', job: 6 }),
        ]),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    expect(await screen.findByText('House Wiring Job')).toBeInTheDocument()
    expect(screen.getByText('Deep Cleaning Job')).toBeInTheDocument()
  })

  it.each(Object.entries(STATUS_LABELS))('renders the plain-language label for %s', async (status, label) => {
    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ status: status as ApplicationStatus })]),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    expect(await screen.findByText(label)).toBeInTheDocument()
  })

  it.each(WITHDRAWABLE)('shows Withdraw for the legal status %s', async (status) => {
    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ status })]),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    expect(await screen.findByRole('button', { name: 'Withdraw' })).toBeInTheDocument()
  })

  it.each(NOT_WITHDRAWABLE)('hides Withdraw entirely for the terminal/illegal status %s', async (status) => {
    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ status })]),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    expect(await screen.findByText(STATUS_LABELS[status])).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
  })

  it('shows the no-applications empty state with a Browse Jobs action', async () => {
    server.use(http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])))

    renderWithProviders(<WorkerApplications />)

    expect(await screen.findByText("You haven't applied to any jobs yet")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse Jobs' })).toHaveAttribute('href', '/jobs')
  })

  it('shows a retryable error state', async () => {
    let callCount = 0
    server.use(
      http.get(`${API_ROOT}/applications/`, () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        return HttpResponse.json([buildApplicationFixture()])
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<WorkerApplications />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('House Wiring for New Apartment Block')).toBeInTheDocument()
  })

  it('withdraws an application through a confirmation dialog and updates the UI + cache', async () => {
    const user = userEvent.setup()
    let patchBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 8, status: 'APPLIED' })]),
      ),
      http.patch(`${API_ROOT}/applications/8/status/`, async ({ request }) => {
        patchBody = await request.json()
        return HttpResponse.json(buildApplicationFixture({ id: 8, status: 'WITHDRAWN' }))
      }),
    )

    renderWithProviders(<WorkerApplications />)

    await user.click(await screen.findByRole('button', { name: 'Withdraw' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/withdraw this application/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Withdraw application' }))

    await waitFor(() => expect(patchBody).toEqual({ status: 'WITHDRAWN' }))
    expect(await screen.findByText('Withdrawn by you')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
  })

  it('cancelling the confirmation dialog withdraws nothing', async () => {
    const user = userEvent.setup()
    let patchCalled = false

    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 8, status: 'APPLIED' })]),
      ),
      http.patch(`${API_ROOT}/applications/8/status/`, () => {
        patchCalled = true
        return HttpResponse.json(buildApplicationFixture({ id: 8, status: 'WITHDRAWN' }))
      }),
    )

    renderWithProviders(<WorkerApplications />)

    await user.click(await screen.findByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Keep application' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(patchCalled).toBe(false)
    expect(await screen.findByText('Applied')).toBeInTheDocument()
  })

  it('shows a plain-language illegal-transition error inside the dialog (race with the server)', async () => {
    const user = userEvent.setup()

    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 8, status: 'APPLIED' })]),
      ),
      http.patch(`${API_ROOT}/applications/8/status/`, () =>
        HttpResponse.json(
          { detail: 'Cannot transition application from HIRED to WITHDRAWN.' },
          { status: 400 },
        ),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    await user.click(await screen.findByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw application' }))

    expect(
      await within(dialog).findByText('Cannot transition application from HIRED to WITHDRAWN.'),
    ).toBeInTheDocument()
    // Dialog stays open so the user can see what happened, not silently dropped.
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('rates the employer from a COMPLETED application and refreshes the row', async () => {
    const user = userEvent.setup()
    let postBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 8, status: 'COMPLETED' })]),
      ),
      http.get(`${API_ROOT}/applications/8/rating/`, () => HttpResponse.json([])),
      http.post(`${API_ROOT}/applications/8/rating/`, async ({ request }) => {
        postBody = await request.json()
        return HttpResponse.json(
          buildRatingFixture({ direction: 'WORKER_TO_EMPLOYER', score: 5, review_text: 'Great employer' }),
          { status: 201 },
        )
      }),
    )

    renderWithProviders(<WorkerApplications />)

    await user.click(await screen.findByRole('button', { name: 'Rate this employer' }))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: '5 stars' }))
    await user.type(within(dialog).getByLabelText(/review \(optional\)/i), 'Great employer')
    await user.click(within(dialog).getByRole('button', { name: 'Submit rating' }))

    await waitFor(() => expect(postBody).toEqual({ score: 5, review_text: 'Great employer' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows the existing rating instead of a Rate action when already rated', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 8, status: 'COMPLETED' })]),
      ),
      http.get(`${API_ROOT}/applications/8/rating/`, () =>
        HttpResponse.json([buildRatingFixture({ direction: 'WORKER_TO_EMPLOYER', score: 4 })]),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    await screen.findByText('House Wiring for New Apartment Block')
    expect(screen.queryByRole('button', { name: 'Rate this employer' })).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: '4.0 out of 5 stars' })).toBeInTheDocument()
  })

  it('shows a backend validation error inside the rating dialog without closing it', async () => {
    const user = userEvent.setup()

    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 8, status: 'COMPLETED' })]),
      ),
      http.get(`${API_ROOT}/applications/8/rating/`, () => HttpResponse.json([])),
      http.post(`${API_ROOT}/applications/8/rating/`, () =>
        HttpResponse.json({ detail: 'You have already rated this application.' }, { status: 400 }),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    await user.click(await screen.findByRole('button', { name: 'Rate this employer' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Submit rating' }))

    expect(
      await within(dialog).findByText('You have already rated this application.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('never offers a Rate action for a non-COMPLETED application', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ id: 8, status: 'HIRED' })]),
      ),
    )

    renderWithProviders(<WorkerApplications />)

    await screen.findByText('Hired')
    expect(screen.queryByRole('button', { name: 'Rate this employer' })).not.toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ status: 'APPLIED' })]),
      ),
    )

    const { container } = renderWithProviders(<WorkerApplications />)
    await waitFor(() => {
      expect(screen.getByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

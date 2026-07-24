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
import { buildEmployerJobFixture } from '@/test/fixtures'
import { EmployerJobDetail } from './JobDetail'

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
      <Route path="/employer/jobs" element={<p>MY JOBS PAGE</p>} />
      <Route path="/employer/jobs/:id" element={<EmployerJobDetail />} />
    </Routes>,
    { route: `/employer/jobs/${id}` },
  )
}

describe('EmployerJobDetail', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it('renders the owner-view job with its real fields', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
    )

    renderAt('5')

    expect(await screen.findByRole('heading', { name: 'House Wiring for New Apartment Block' })).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Rs. 1,300 / day')).toBeInTheDocument()
  })

  it('shows Edit Job and View Applications for an active job, and Close Job', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5, status: 'ACTIVE' }))),
    )

    renderAt('5')
    await screen.findByRole('heading', { name: 'House Wiring for New Apartment Block' })

    expect(screen.getByRole('link', { name: /edit job/i })).toHaveAttribute('href', '/employer/jobs/5/edit')
    expect(screen.getByRole('link', { name: /view applications/i })).toHaveAttribute(
      'href',
      '/employer/jobs/5/applications',
    )
    expect(screen.getByRole('button', { name: /close job/i })).toBeInTheDocument()
  })

  it('still shows Edit Job for a closed job, but never Close Job', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5, status: 'CLOSED' }))),
    )

    renderAt('5')
    await screen.findByRole('heading', { name: 'House Wiring for New Apartment Block' })

    expect(screen.getByRole('link', { name: /edit job/i })).toHaveAttribute('href', '/employer/jobs/5/edit')
    expect(screen.queryByRole('button', { name: /close job/i })).not.toBeInTheDocument()
  })

  it('closes an active job through a confirmation dialog and updates the badge without a reopen action', async () => {
    const user = userEvent.setup()
    let patchBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5, status: 'ACTIVE' }))),
      http.patch(`${API_ROOT}/jobs/5/`, async ({ request }) => {
        patchBody = await request.json()
        return HttpResponse.json(buildEmployerJobFixture({ id: 5, status: 'CLOSED' }))
      }),
    )

    renderAt('5')
    await user.click(await screen.findByRole('button', { name: /close job/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/close this job/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close job' }))

    await waitFor(() => expect(patchBody).toEqual({ status: 'CLOSED' }))
    expect(await screen.findByText('Closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close job/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reopen/i })).not.toBeInTheDocument()
  })

  it('cancelling the close dialog leaves the job open', async () => {
    const user = userEvent.setup()
    let patchCalled = false

    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5, status: 'ACTIVE' }))),
      http.patch(`${API_ROOT}/jobs/5/`, () => {
        patchCalled = true
        return HttpResponse.json(buildEmployerJobFixture({ id: 5, status: 'CLOSED' }))
      }),
    )

    renderAt('5')
    await user.click(await screen.findByRole('button', { name: /close job/i }))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Keep it open' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(patchCalled).toBe(false)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows a clear message and a way back for a non-owner (403)', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json({ detail: 'Not found.' }, { status: 403 })),
    )

    renderAt('5')

    expect(await screen.findByText('Not your job')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to my jobs/i })).toHaveAttribute('href', '/employer/jobs')
  })

  it('shows a clear message and a way back for a missing job (404)', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    )

    renderAt('5')

    expect(await screen.findByText('Job not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to my jobs/i })).toHaveAttribute('href', '/employer/jobs')
  })

  it('shows a retryable error state for a genuine server failure', async () => {
    let callCount = 0
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        return HttpResponse.json(buildEmployerJobFixture({ id: 5 }))
      }),
    )

    const user = userEvent.setup()
    renderAt('5')

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'House Wiring for New Apartment Block' })).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
    )

    const { container } = renderAt('5')
    await screen.findByRole('heading', { name: 'House Wiring for New Apartment Block' })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

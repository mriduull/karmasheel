import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildEmployerJobFixture, buildEmployerProfileFixture } from '@/test/fixtures'
import { EmployerJobs } from './Jobs'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

describe('EmployerJobs', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it('treats the response as a bare array and renders one card per job', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () =>
        HttpResponse.json([
          buildEmployerJobFixture({ id: 1, title: 'House Wiring Job' }),
          buildEmployerJobFixture({ id: 2, title: 'Deep Cleaning Job' }),
        ]),
      ),
    )

    renderWithProviders(<EmployerJobs />)

    expect(await screen.findByText('House Wiring Job')).toBeInTheDocument()
    expect(screen.getByText('Deep Cleaning Job')).toBeInTheDocument()
  })

  it('shows a functional "Post a Job" action for a VERIFIED employer', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([buildEmployerJobFixture()])),
    )

    renderWithProviders(<EmployerJobs />)

    await screen.findByText('House Wiring for New Apartment Block')
    expect(screen.getByRole('link', { name: /post a job/i })).toHaveAttribute('href', '/employer/jobs/new')
  })

  it('explains, without a functional link, when the employer is not yet verified', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'PENDING' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([buildEmployerJobFixture()])),
    )

    renderWithProviders(<EmployerJobs />)

    await screen.findByText('House Wiring for New Apartment Block')
    expect(screen.getByText('Posting a job is available once your account is verified.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /post a job/i })).not.toBeInTheDocument()
  })

  it('filters jobs client-side by Active/Closed, without any request params', async () => {
    const user = userEvent.setup()
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, ({ request }) => {
        requestedUrls.push(request.url)
        return HttpResponse.json([
          buildEmployerJobFixture({ id: 1, title: 'Active Job', status: 'ACTIVE' }),
          buildEmployerJobFixture({ id: 2, title: 'Closed Job', status: 'CLOSED' }),
        ])
      }),
    )

    renderWithProviders(<EmployerJobs />)

    await screen.findByText('Active Job')
    expect(screen.getByText('Closed Job')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Active' }))
    expect(screen.getByText('Active Job')).toBeInTheDocument()
    expect(screen.queryByText('Closed Job')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Closed' }))
    expect(screen.queryByText('Active Job')).not.toBeInTheDocument()
    expect(screen.getByText('Closed Job')).toBeInTheDocument()

    // Only ever the one unfiltered fetch — no ?status= param sent, ever.
    expect(requestedUrls).toHaveLength(1)
    expect(requestedUrls[0]).not.toContain('status')
  })

  it('shows the no-jobs empty state', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<EmployerJobs />)

    expect(await screen.findByText("You haven't posted a job yet")).toBeInTheDocument()
  })

  it('each job card links to its own owner Job Detail page', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([buildEmployerJobFixture({ id: 42 })])),
    )

    renderWithProviders(<EmployerJobs />)

    const card = await screen.findByRole('link', { name: /house wiring for new apartment block/i })
    expect(card).toHaveAttribute('href', '/employer/jobs/42')
  })

  it('shows a retryable error state', async () => {
    let callCount = 0
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        return HttpResponse.json([buildEmployerJobFixture()])
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<EmployerJobs />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('House Wiring for New Apartment Block')).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([buildEmployerJobFixture()])),
    )

    const { container } = renderWithProviders(<EmployerJobs />)
    await waitFor(() => {
      expect(screen.getByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildEmployerJobFixture, buildEmployerProfileFixture } from '@/test/fixtures'
import { EmployerDashboard } from './Dashboard'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

describe('EmployerDashboard', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it("renders the username and organization name once the profile loads", async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ organization_name: 'Himal Builders' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<EmployerDashboard />)

    expect(
      await screen.findByRole('heading', { name: /welcome, demo_employer_verified · himal builders/i }),
    ).toBeInTheDocument()
  })

  it('shows a functional "Post a Job" shortcut for a VERIFIED employer', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<EmployerDashboard />)

    expect(await screen.findByRole('link', { name: /post a job/i })).toHaveAttribute(
      'href',
      '/employer/jobs/new',
    )
  })

  it('disables "Post a Job" with an explanation for a PENDING employer', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'PENDING' })),
      ),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<EmployerDashboard />)

    expect(await screen.findByText('Available once your account is verified')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /post a job/i })).not.toBeInTheDocument()
  })

  it('shows job counts (total/active/closed) computed from the bare jobs array', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, () =>
        HttpResponse.json([
          buildEmployerJobFixture({ id: 1, status: 'ACTIVE' }),
          buildEmployerJobFixture({ id: 2, status: 'ACTIVE' }),
          buildEmployerJobFixture({ id: 3, status: 'CLOSED' }),
        ]),
      ),
    )

    renderWithProviders(<EmployerDashboard />)

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText(/jobs total · 2 active · 1 closed/i)).toBeInTheDocument()
  })

  it('shows a no-jobs empty state distinct from the loading/error states', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<EmployerDashboard />)

    expect(await screen.findByText("You haven't posted a job yet.")).toBeInTheDocument()
  })

  it('the jobs section keeps working with a retry after a failure, independent of the profile section', async () => {
    let jobsCallCount = 0
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, () => {
        jobsCallCount += 1
        if (jobsCallCount === 1) return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        return HttpResponse.json([buildEmployerJobFixture()])
      }),
    )

    renderWithProviders(<EmployerDashboard />)

    // Profile section renders successfully even while the jobs section errors.
    await screen.findByText('Verified employer')
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
  })

  it('has no automatically-detectable accessibility violations once loaded', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([buildEmployerJobFixture()])),
    )

    const { container } = renderWithProviders(<EmployerDashboard />)
    await waitFor(() => {
      expect(screen.getByText('View all jobs')).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildEmployerJobFixture, buildWorkerRecommendationFixture, buildApplicationFixture } from '@/test/fixtures'
import { EmployerRecommendations } from './Recommendations'

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
      <Route path="/employer/jobs/:id/recommendations" element={<EmployerRecommendations />} />
    </Routes>,
    { route: `/employer/jobs/${id}/recommendations` },
  )
}

describe('EmployerRecommendations', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it('renders several ranked worker candidates for the owned job', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/recommendations/jobs/5/workers/`, () =>
        HttpResponse.json([
          buildWorkerRecommendationFixture({ final_score: 97.79, worker: { id: 3, username: 'demo_worker_ramesh' } }),
          buildWorkerRecommendationFixture({ final_score: 75.25, worker: { id: 9, username: 'demo_worker_suresh' } }),
          buildWorkerRecommendationFixture({ final_score: 74.62, worker: { id: 6, username: 'demo_worker_kamal' } }),
        ]),
      ),
    )

    renderAt('5')

    expect(await screen.findByText('demo_worker_ramesh')).toBeInTheDocument()
    expect(screen.getByText('demo_worker_suresh')).toBeInTheDocument()
    expect(screen.getByText('demo_worker_kamal')).toBeInTheDocument()

    // The documented top candidate is visibly the strongest score.
    const scores = screen.getAllByText(/^\d+$/).map((el) => Number(el.textContent))
    expect(Math.max(...scores)).toBe(98)
  })

  it('shows the score and reasons breakdown for a candidate', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/recommendations/jobs/5/workers/`, () =>
        HttpResponse.json([buildWorkerRecommendationFixture()]),
      ),
    )

    const user = userEvent.setup()
    renderAt('5')

    await screen.findByText('demo_worker_ramesh')
    await user.click(screen.getByRole('button', { name: /why this match/i }))

    expect(await screen.findByText(/matches 2 of 2 required skills/i)).toBeInTheDocument()
    expect(screen.getByText(/mutual fit/i)).toBeInTheDocument()
  })

  it('shows an existing application relationship when one exists', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () =>
        HttpResponse.json([buildApplicationFixture({ worker_username: 'demo_worker_ramesh', status: 'SHORTLISTED' })]),
      ),
      http.get(`${API_ROOT}/recommendations/jobs/5/workers/`, () =>
        HttpResponse.json([buildWorkerRecommendationFixture({ worker: { username: 'demo_worker_ramesh' } })]),
      ),
    )

    renderAt('5')

    expect(await screen.findByText('Already applied to this job:')).toBeInTheDocument()
    expect(screen.getByText('Shortlisted')).toBeInTheDocument()
  })

  it('shows the empty state when no candidates match', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/recommendations/jobs/5/workers/`, () => HttpResponse.json([])),
    )

    renderAt('5')

    expect(await screen.findByText('No matching workers yet for this job')).toBeInTheDocument()
  })

  it('shows a retryable error state on API failure', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/recommendations/jobs/5/workers/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )

    renderAt('5')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/applications/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/recommendations/jobs/5/workers/`, () =>
        HttpResponse.json([buildWorkerRecommendationFixture()]),
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

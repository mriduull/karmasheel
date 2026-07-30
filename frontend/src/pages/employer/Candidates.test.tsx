import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildEmployerJobFixture, buildWorkerCandidateFixture } from '@/test/fixtures'
import { EmployerCandidates } from './Candidates'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_pending',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/employer/jobs/:id" element={<p>OWNER JOB DETAIL PAGE</p>} />
      <Route path="/employer/jobs/:id/candidates" element={<EmployerCandidates />} />
    </Routes>,
    { route: `/employer/jobs/${id}/candidates` },
  )
}

describe('EmployerCandidates', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it('renders the coarse candidate list without any score, even for an unverified employer', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/candidates/`, () =>
        HttpResponse.json([buildWorkerCandidateFixture({ username: 'demo_worker_ramesh' })]),
      ),
    )

    renderAt('5')

    expect(await screen.findByText('demo_worker_ramesh')).toBeInTheDocument()
    expect(screen.queryByText(/out of 100 match/i)).not.toBeInTheDocument()
  })

  it('shows the empty state when no candidates are found', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/candidates/`, () => HttpResponse.json([])),
    )

    renderAt('5')

    expect(await screen.findByText('No candidates found')).toBeInTheDocument()
  })

  it('shows a retryable error state', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildEmployerJobFixture({ id: 5 }))),
      http.get(`${API_ROOT}/jobs/5/candidates/`, () => HttpResponse.json({ detail: 'Server error' }, { status: 500 })),
    )

    renderAt('5')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

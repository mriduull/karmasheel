import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { createTestQueryClient, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildEmployerProfileFixture } from '@/test/fixtures'
import { EmployerLayout } from './EmployerLayout'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

function renderEmployerLayout(route = '/employer') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<EmployerLayout />}>
            <Route path="/employer" element={<p>employer-dashboard-content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('EmployerLayout navigation', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it('always shows Home, My Jobs, and Profile — no employer-wide Applicants item', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'PENDING' })),
      ),
    )

    renderEmployerLayout()

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /^home$/i }).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByRole('link', { name: /my jobs/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /^profile$/i }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /applicants/i })).not.toBeInTheDocument()
  })

  it('shows Post a Job once verification resolves to VERIFIED', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
    )

    renderEmployerLayout()

    const postAJobLinks = await screen.findAllByRole('link', { name: /post a job/i })
    expect(postAJobLinks.length).toBeGreaterThan(0)
    for (const link of postAJobLinks) {
      expect(link).toHaveAttribute('href', '/employer/jobs/new')
    }
  })

  it('never shows Post a Job for a PENDING employer', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'PENDING' })),
      ),
    )

    renderEmployerLayout()

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /^home$/i }).length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('link', { name: /post a job/i })).not.toBeInTheDocument()
  })

  it('never shows Post a Job while verification status is still loading or on error', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json({ detail: 'Server error' }, { status: 500 })),
    )

    renderEmployerLayout()

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /^home$/i }).length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('link', { name: /post a job/i })).not.toBeInTheDocument()
  })
})

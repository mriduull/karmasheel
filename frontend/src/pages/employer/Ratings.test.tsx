import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildRatingSummaryFixture } from '@/test/fixtures'
import { EmployerRatings } from './Ratings'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

describe('EmployerRatings', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  it('renders the real aggregate rating summary', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/ratings/summary/`, () =>
        HttpResponse.json(buildRatingSummaryFixture({ average_rating: 5, rating_count: 1 })),
      ),
    )

    renderWithProviders(<EmployerRatings />)

    expect(await screen.findByText('5.0')).toBeInTheDocument()
  })

  it('shows the cold-start empty state', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/ratings/summary/`, () =>
        HttpResponse.json(buildRatingSummaryFixture({ average_rating: null, rating_count: 0 })),
      ),
    )

    renderWithProviders(<EmployerRatings />)

    expect(await screen.findByText('No ratings yet')).toBeInTheDocument()
  })
})

import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildRatingSummaryFixture } from '@/test/fixtures'
import { WorkerRatings } from './Ratings'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

describe('WorkerRatings', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
  })

  it('renders the real aggregate rating summary', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/ratings/summary/`, () =>
        HttpResponse.json(buildRatingSummaryFixture({ average_rating: 5, rating_count: 1 })),
      ),
    )

    renderWithProviders(<WorkerRatings />)

    expect(await screen.findByText('5.0')).toBeInTheDocument()
    expect(screen.getByText('1 rating')).toBeInTheDocument()
  })

  it('shows the cold-start empty state, never an invented 0.0', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/ratings/summary/`, () =>
        HttpResponse.json(buildRatingSummaryFixture({ average_rating: null, rating_count: 0 })),
      ),
    )

    renderWithProviders(<WorkerRatings />)

    expect(await screen.findByText('No ratings yet')).toBeInTheDocument()
    expect(screen.queryByText('0.0')).not.toBeInTheDocument()
  })

  it('shows a retryable error state', async () => {
    server.use(
      http.get(`${API_ROOT}/applications/ratings/summary/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )

    renderWithProviders(<WorkerRatings />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

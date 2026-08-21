import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildJobRecommendationFixture, buildApplicationFixture } from '@/test/fixtures'
import { WorkerRecommendations } from './Recommendations'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

describe('WorkerRecommendations', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
  })

  it('shows a loading state before results arrive', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return HttpResponse.json([])
      }),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerRecommendations />)

    expect(document.querySelectorAll('[aria-hidden="true"].animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders several ranked recommendations with scores and reasons', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, () =>
        HttpResponse.json([
          buildJobRecommendationFixture({ final_score: 97.79, job: { id: 5, title: 'House Wiring for New Apartment Block' } }),
          buildJobRecommendationFixture({ final_score: 89.67, job: { id: 11, title: 'Electrical Rewiring for Old Bungalow' } }),
          buildJobRecommendationFixture({ final_score: 63.1, job: { id: 12, title: 'Switchboard and Panel Upgrade' } }),
        ]),
      ),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    const user = userEvent.setup()
    renderWithProviders(<WorkerRecommendations />)

    expect(await screen.findByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    expect(screen.getByText('Electrical Rewiring for Old Bungalow')).toBeInTheDocument()
    expect(screen.getByText('Switchboard and Panel Upgrade')).toBeInTheDocument()
    expect(screen.getByText('98')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /why this match/i })[0])
    expect(await screen.findByText(/matches 2 of 2 required skills/i)).toBeInTheDocument()
  })

  it('renders the empty state with a link to complete the profile', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerRecommendations />)

    expect(await screen.findByText('No matches yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /complete your profile/i })).toHaveAttribute(
      'href',
      '/worker/profile',
    )
  })

  it('shows a retryable error state on a genuine server failure', async () => {
    let callCount = 0
    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        return HttpResponse.json([buildJobRecommendationFixture()])
      }),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    const user = userEvent.setup()
    renderWithProviders(<WorkerRecommendations />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('House Wiring for New Apartment Block')).toBeInTheDocument()
  })

  it('shows a profile-completion prompt on a 404 (no worker profile yet)', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, () =>
        HttpResponse.json({ detail: 'Worker profile not found.' }, { status: 404 }),
      ),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerRecommendations />)

    expect(await screen.findByText('Complete your profile to see matches')).toBeInTheDocument()
  })

  it('links each recommendation to the real public Job Detail page', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, () =>
        HttpResponse.json([buildJobRecommendationFixture({ job: { id: 5 } })]),
      ),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerRecommendations />)

    const jobLinks = await screen.findAllByRole('link', { name: 'House Wiring for New Apartment Block' })
    expect(jobLinks[0]).toHaveAttribute('href', '/jobs/5')
    expect(screen.getByRole('link', { name: 'View job' })).toHaveAttribute('href', '/jobs/5')
  })

  it('applies to a recommended job through the real application flow', async () => {
    let postBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, () =>
        HttpResponse.json([buildJobRecommendationFixture({ job: { id: 5 } })]),
      ),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
      http.post(`${API_ROOT}/applications/`, async ({ request }) => {
        postBody = await request.json()
        return HttpResponse.json(buildApplicationFixture({ id: 20, job: 5 }), { status: 201 })
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<WorkerRecommendations />)

    await user.click(await screen.findByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(postBody).toMatchObject({ job: 5 }))
    expect(await screen.findByText('Application sent.')).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/jobs/`, () => HttpResponse.json([buildJobRecommendationFixture()])),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    const { container } = renderWithProviders(<WorkerRecommendations />)
    await waitFor(() => {
      expect(screen.getByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

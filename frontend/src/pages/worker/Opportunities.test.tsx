import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import {
  buildJobRecommendationFixture,
  buildMissingSkillAdvisoryFixture,
  buildOpportunityAdvisoryFixture,
} from '@/test/fixtures'
import { WorkerOpportunities } from './Opportunities'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_hari',
  email: 'hari@example.com',
  phone_number: '9811100013',
  role: 'WORKER' as const,
  is_contact_verified: false,
}

describe('WorkerOpportunities', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
  })

  it('renders near-miss jobs with their scores', async () => {
    server.use(
      // No overlapping missing-skill job_ids here — this test is only
      // about the near-miss section, kept free of the (legitimate)
      // duplicate-link case covered by the missing-skills test below.
      http.get(`${API_ROOT}/recommendations/opportunities/`, () =>
        HttpResponse.json(buildOpportunityAdvisoryFixture({ missing_skills: [] })),
      ),
    )

    renderWithProviders(<WorkerOpportunities />)

    expect(await screen.findByText('Bathroom & Tile Renovation')).toBeInTheDocument()
    expect(screen.getByText('67')).toBeInTheDocument()
  })

  it('renders ranked missing-skill suggestions as plain sentences with job links', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/opportunities/`, () =>
        HttpResponse.json(
          buildOpportunityAdvisoryFixture({
            missing_skills: [
              buildMissingSkillAdvisoryFixture({
                skill: { id: 6, name: 'Tile Installation', subcategory: 'Masonry' },
                missing_frequency: 2,
                job_ids: [7, 13],
              }),
            ],
            near_miss_jobs: [
              buildJobRecommendationFixture({ job: { id: 7, title: 'Bathroom & Tile Renovation' } }),
              buildJobRecommendationFixture({ job: { id: 13, title: 'Floor Tiling and Masonry Repair' } }),
            ],
          }),
        ),
      ),
    )

    renderWithProviders(<WorkerOpportunities />)

    expect(await screen.findByText(/tile installation/i)).toBeInTheDocument()
    expect(screen.getByText(/needed for 2 jobs you're close to qualifying for/i)).toBeInTheDocument()

    // Scoped to the "Skills that would help" section specifically — the
    // same job legitimately also appears as its own near-miss card above,
    // with its own separate link of the same accessible name.
    const skillsSection = screen.getByRole('heading', { name: 'Skills that would help' })
      .closest('section') as HTMLElement
    expect(within(skillsSection).getByRole('link', { name: 'Bathroom & Tile Renovation' })).toHaveAttribute(
      'href',
      '/jobs/7',
    )
    expect(
      within(skillsSection).getByRole('link', { name: 'Floor Tiling and Masonry Repair' }),
    ).toHaveAttribute('href', '/jobs/13')
  })

  it('shows a positive-framed empty state when there is nothing to advise on', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/opportunities/`, () =>
        HttpResponse.json({ near_miss_jobs: [], missing_skills: [] }),
      ),
    )

    renderWithProviders(<WorkerOpportunities />)

    expect(
      await screen.findByText("You're either well-matched already or there's nothing close yet"),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Recommended Jobs' })).toHaveAttribute(
      'href',
      '/worker/recommendations',
    )
  })

  it('surfaces the missing-location warning inside a near-miss card, matching the seeded Gita scenario', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/opportunities/`, () =>
        HttpResponse.json(
          buildOpportunityAdvisoryFixture({
            near_miss_jobs: [
              buildJobRecommendationFixture({
                distance_km: null,
                distance_score: null,
                warnings: ['Worker location is unavailable; distance could not be calculated.'],
                job: { id: 8, title: 'Home Cooking for Family Event' },
              }),
            ],
            missing_skills: [
              buildMissingSkillAdvisoryFixture({ skill: { id: 9, name: 'Kitchen Helper', subcategory: 'Cooking' }, job_ids: [8] }),
            ],
          }),
        ),
      ),
    )

    renderWithProviders(<WorkerOpportunities />)

    expect(await screen.findByText('Distance unknown')).toBeInTheDocument()
  })

  it('shows a retryable error state on API failure', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/opportunities/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )

    renderWithProviders(<WorkerOpportunities />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/recommendations/opportunities/`, () =>
        HttpResponse.json(buildOpportunityAdvisoryFixture()),
      ),
    )

    const { container } = renderWithProviders(<WorkerOpportunities />)
    await waitFor(() => {
      expect(screen.getAllByText('Bathroom & Tile Renovation').length).toBeGreaterThan(0)
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

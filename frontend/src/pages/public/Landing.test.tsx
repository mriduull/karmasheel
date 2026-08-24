import '@/i18n'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { axe } from 'jest-axe'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders } from '@/test/utils'
import { CATEGORY_TREE_FIXTURES, buildJobFixture } from '@/test/fixtures'
import { Landing } from './Landing'

function renderLanding() {
  server.use(
    http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
    http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
  )
  return renderWithProviders(<Landing />)
}

describe('Landing', () => {
  it('renders the hero, value proposition, and primary CTAs', () => {
    renderLanding()

    expect(
      screen.getByRole('heading', { level: 1, name: /two sides\. one clear match/i }),
    ).toBeInTheDocument()

    // The CTA appears twice by design (hero + final CTA band) — same
    // "one primary action, repeated" pattern the current app already uses.
    const workerCtas = screen.getAllByRole('link', { name: 'I am looking for work' })
    expect(workerCtas.length).toBeGreaterThanOrEqual(1)
    workerCtas.forEach((link) => expect(link).toHaveAttribute('href', '/register?role=WORKER'))

    const employerCtas = screen.getAllByRole('link', { name: 'I need workers' })
    expect(employerCtas.length).toBeGreaterThanOrEqual(1)
    employerCtas.forEach((link) => expect(link).toHaveAttribute('href', '/register?role=EMPLOYER'))

    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  })

  it('loads and renders taxonomy categories from the real tree endpoint shape', async () => {
    server.use(
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json(CATEGORY_TREE_FIXTURES)),
      http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('Construction & Repair')).toBeInTheDocument()
    })
    expect(screen.getByText('Domestic & Local Services')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Construction & Repair/ }),
    ).toHaveAttribute('href', '/jobs?category=1')
  })

  it('hides the category section entirely when the tree is empty, rather than a broken box', async () => {
    renderLanding()

    await waitFor(() => {
      expect(screen.queryByText(/browse by category/i)).not.toBeInTheDocument()
    })
  })

  it('shows a small active-job preview strip when jobs are available', async () => {
    server.use(
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/jobs/browse/`, () =>
        HttpResponse.json([buildJobFixture({ id: 5, title: 'House Wiring Job' })]),
      ),
    )

    renderWithProviders(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('House Wiring Job')).toBeInTheDocument()
    })
  })

  it('shows the interactive Matchline hero example, clearly labeled as an example', () => {
    renderLanding()

    expect(screen.getByText('Ram Bahadur')).toBeInTheDocument()
    expect(screen.getByText('Electrician Required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skills/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /distance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /availability/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /experience/i })).toBeInTheDocument()
    expect(screen.getByText(/example match/i)).toBeInTheDocument()
  })

  it('reveals a match factor’s explanation when clicked', async () => {
    renderLanding()
    const user = userEvent.setup()

    const skillsButton = screen.getByRole('button', { name: /skills/i })
    expect(skillsButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(skillsButton)

    expect(skillsButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/wiring and panel-repair skills/i)).toBeInTheDocument()
  })

  it('shows a labeled example of an explained match, using the real recommendation card', () => {
    renderLanding()

    expect(screen.getByText('What a match looks like')).toBeInTheDocument()
    expect(screen.getByText('Example')).toBeInTheDocument()
    expect(screen.getByText('Residential Electrician — Panel Rewiring')).toBeInTheDocument()
    expect(screen.getByText('92')).toBeInTheDocument()
    // "out of 100 match" appears twice on the page (hero example + this
    // one) — both are real MatchScoreBadge instances, not a collision.
    expect(screen.getAllByText(/out of 100 match/i)).toHaveLength(2)
    // "Why this match?" is RecommendationCard's own existing toggle — not
    // expanded by default, same as everywhere else it's used.
    expect(screen.getByRole('button', { name: /why this match/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('has no automatically-detectable accessibility violations', async () => {
    const { container } = renderLanding()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

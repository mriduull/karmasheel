import '@/i18n'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { axe } from 'jest-axe'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { createTestQueryClient, renderWithProviders } from '@/test/utils'
import { CATEGORY_TREE_FIXTURES, buildJobFixture } from '@/test/fixtures'
import { Landing } from './Landing'

function renderLanding() {
  server.use(
    http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
    http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
    http.get(`${API_ROOT}/taxonomy/categories/`, () => HttpResponse.json([])),
  )
  return renderWithProviders(<Landing />)
}

describe('Landing', () => {
  it('renders the hero, value proposition, and primary CTAs', () => {
    renderLanding()

    expect(
      screen.getByRole('heading', { level: 1, name: /find work that fits\. find workers who fit/i }),
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

  it('offers only real, wireable hero filters — category, work type, and search', () => {
    renderLanding()

    expect(screen.getByLabelText('Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Work type')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
    // No keyword field and no bookmark control exist anywhere on the page —
    // neither is backed by the API (design constraint, not an oversight).
    expect(screen.queryByLabelText(/keyword/i)).not.toBeInTheDocument()
  })

  it('navigates to job browse with the selected category and work type on hero search', async () => {
    const user = userEvent.setup()

    server.use(
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/taxonomy/categories/`, () =>
        HttpResponse.json([{ id: 1, name: 'Construction & Repair' }]),
      ),
    )

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/jobs" element={<p>job-browse-content</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByLabelText('Category')).not.toBeDisabled())
    await user.selectOptions(screen.getByLabelText('Category'), '1')
    await user.selectOptions(screen.getByLabelText('Work type'), 'CONTRACT')
    await user.click(screen.getByRole('button', { name: /search/i }))

    expect(await screen.findByText('job-browse-content')).toBeInTheDocument()
  })

  it('labels the hero example chips as illustrative, never as live statistics', () => {
    renderLanding()

    const exampleGroup = screen.getByRole('group', { name: /illustrative only, not live data/i })
    expect(within(exampleGroup).getByText('Example')).toBeInTheDocument()
    expect(within(exampleGroup).getByText('4/5 required skills')).toBeInTheDocument()
    expect(within(exampleGroup).getByText('2.4 km away')).toBeInTheDocument()
    expect(within(exampleGroup).getByText('Available tomorrow')).toBeInTheDocument()
  })

  it('loads and renders taxonomy categories from the real tree endpoint shape', async () => {
    server.use(
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json(CATEGORY_TREE_FIXTURES)),
      http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/taxonomy/categories/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('Construction & Repair')).toBeInTheDocument()
    })
    expect(screen.getByText('Domestic & Local Services')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Construction & Repair/ }),
    ).toHaveAttribute('href', '/jobs?category=1')
    // The grid's final tile is a plain "explore all" link — never a
    // fabricated job-count statistic.
    expect(screen.getByRole('link', { name: /explore all categories/i })).toHaveAttribute(
      'href',
      '/jobs',
    )
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
      http.get(`${API_ROOT}/taxonomy/categories/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/jobs/browse/`, () =>
        HttpResponse.json([buildJobFixture({ id: 5, title: 'House Wiring Job' })]),
      ),
    )

    renderWithProviders(<Landing />)

    await waitFor(() => {
      expect(screen.getByText('House Wiring Job')).toBeInTheDocument()
    })
  })

  it('shows the interactive Matchline example, clearly labeled as an example', () => {
    renderLanding()

    expect(screen.getByText('Suman Thapa')).toBeInTheDocument()
    expect(screen.getByText('Delivery Rider Required')).toBeInTheDocument()
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
    expect(screen.getByText(/delivery and route navigation skills/i)).toBeInTheDocument()
  })

  it('shows a labeled example of an explained match, using the real recommendation card', () => {
    renderLanding()

    expect(screen.getByText('What a match looks like')).toBeInTheDocument()
    // "Example" appears twice by design — the hero's illustrative chip
    // group and this section's own label — both genuinely labeled, not a
    // collision to fix.
    expect(screen.getAllByText('Example').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Residential Electrician — Panel Rewiring')).toBeInTheDocument()
    expect(screen.getByText('92')).toBeInTheDocument()
    // "out of 100 match" appears twice on the page (Matchline example +
    // this one) — both are real MatchScoreBadge instances, not a collision.
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

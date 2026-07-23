import '@/i18n'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders } from '@/test/utils'
import { CATEGORY_FIXTURES, SUBCATEGORY_FIXTURES, buildJobFixture } from '@/test/fixtures'
import { JobBrowse } from './JobBrowse'

function mockTaxonomy() {
  server.use(
    http.get(`${API_ROOT}/taxonomy/categories/`, () => HttpResponse.json(CATEGORY_FIXTURES)),
    http.get(`${API_ROOT}/taxonomy/subcategories/`, ({ request }) => {
      const url = new URL(request.url)
      const categoryId = url.searchParams.get('category')
      const filtered = categoryId
        ? SUBCATEGORY_FIXTURES.filter((sub) => String(sub.category) === categoryId)
        : SUBCATEGORY_FIXTURES
      return HttpResponse.json(filtered)
    }),
  )
}

describe('JobBrowse', () => {
  it('treats the browse response as a bare array and renders a job card per entry', async () => {
    mockTaxonomy()
    server.use(
      http.get(`${API_ROOT}/jobs/browse/`, () =>
        HttpResponse.json([
          buildJobFixture({ id: 5, title: 'House Wiring Job' }),
          buildJobFixture({ id: 6, title: 'Deep Cleaning Job' }),
        ]),
      ),
    )

    renderWithProviders(<JobBrowse />, { route: '/jobs' })

    await waitFor(() => {
      expect(screen.getByText('House Wiring Job')).toBeInTheDocument()
    })
    expect(screen.getByText('Deep Cleaning Job')).toBeInTheDocument()
  })

  it('shows loading skeletons before the response resolves', async () => {
    mockTaxonomy()
    server.use(
      http.get(`${API_ROOT}/jobs/browse/`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return HttpResponse.json([])
      }),
    )

    renderWithProviders(<JobBrowse />, { route: '/jobs' })

    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByText('No jobs match your filters yet')).toBeInTheDocument())
  })

  it('shows a useful empty state with a way to clear filters', async () => {
    mockTaxonomy()
    server.use(http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])))

    renderWithProviders(<JobBrowse />, { route: '/jobs?category=1' })

    expect(await screen.findByText('No jobs match your filters yet')).toBeInTheDocument()
    // Two "Clear filters" affordances legitimately coexist here: one in
    // the always-visible filter panel, one in the empty state itself.
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0)
  })

  it('shows a retryable error banner on failure', async () => {
    mockTaxonomy()
    let callCount = 0
    server.use(
      http.get(`${API_ROOT}/jobs/browse/`, () => {
        callCount += 1
        if (callCount === 1) {
          return HttpResponse.json({ detail: 'Server error' }, { status: 500 })
        }
        return HttpResponse.json([buildJobFixture()])
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<JobBrowse />, { route: '/jobs' })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(screen.getByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    })
  })

  it('constructs the exact backend query params when a category filter is applied', async () => {
    mockTaxonomy()
    let capturedUrl: URL | null = null

    server.use(
      http.get(`${API_ROOT}/jobs/browse/`, ({ request }) => {
        capturedUrl = new URL(request.url)
        return HttpResponse.json([])
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<JobBrowse />, { route: '/jobs' })

    await waitFor(() => expect(screen.getByLabelText('Category')).not.toBeDisabled())
    await user.selectOptions(screen.getByLabelText('Category'), '1')

    await waitFor(() => {
      expect(capturedUrl?.searchParams.get('category')).toBe('1')
    })

    await waitFor(() => expect(screen.getByLabelText('Subcategory')).not.toBeDisabled())
    await user.selectOptions(screen.getByLabelText('Subcategory'), '1')

    await waitFor(() => {
      expect(capturedUrl?.searchParams.get('subcategory')).toBe('1')
    })
  })

  it('does not offer keyword/title search, a map, bookmarking, or server-pagination controls', async () => {
    mockTaxonomy()
    server.use(http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([buildJobFixture()])))

    renderWithProviders(<JobBrowse />, { route: '/jobs' })

    await waitFor(() => {
      expect(screen.getByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    })

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save|bookmark/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next page|previous page/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/map/i)).not.toBeInTheDocument()
  })

  it('never shows a distance figure on a job card (the public serializer has no distance field)', async () => {
    mockTaxonomy()
    server.use(http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([buildJobFixture()])))

    renderWithProviders(<JobBrowse />, { route: '/jobs' })

    const card = await screen.findByText('House Wiring for New Apartment Block')
    const cardContainer = card.closest('a')
    expect(cardContainer).not.toBeNull()
    expect(within(cardContainer as HTMLElement).queryByText(/km away|km$/)).not.toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    mockTaxonomy()
    server.use(http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([buildJobFixture()])))

    const { container } = renderWithProviders(<JobBrowse />, { route: '/jobs' })
    await waitFor(() => {
      expect(screen.getByText('House Wiring for New Apartment Block')).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

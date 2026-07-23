import '@/i18n'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders } from '@/test/utils'
import { CATEGORY_TREE_FIXTURES, buildJobFixture } from '@/test/fixtures'
import { Landing } from './Landing'

describe('Landing', () => {
  it('renders the hero, value proposition, and primary CTAs', () => {
    server.use(
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<Landing />)

    expect(
      screen.getByRole('heading', { level: 1, name: /find honest local work/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find Work' })).toHaveAttribute(
      'href',
      '/register?role=WORKER',
    )
    expect(screen.getByRole('link', { name: 'Hire Workers' })).toHaveAttribute(
      'href',
      '/register?role=EMPLOYER',
    )
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
    server.use(
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
      http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<Landing />)

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
})

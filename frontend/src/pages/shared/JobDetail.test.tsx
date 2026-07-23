import '@/i18n'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { createTestQueryClient, resetAuthStore } from '@/test/utils'
import { buildJobFixture } from '@/test/fixtures'
import { JobDetail } from './JobDetail'

function renderJobDetail(route: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/jobs" element={<p>browse-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('JobDetail', () => {
  it('renders title, status, employer, description, and skills from the real public serializer shape', async () => {
    resetAuthStore()
    server.use(
      http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5 }))),
    )

    renderJobDetail('/jobs/5')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'House Wiring for New Apartment Block' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Kathmandu Home Services Pvt. Ltd.')).toBeInTheDocument()
    expect(screen.getByText('Verified employer')).toBeInTheDocument()
    expect(screen.getByText('Rs. 1,300 / day')).toBeInTheDocument()
    expect(screen.getByText('House Wiring')).toBeInTheDocument()
    expect(screen.getByText('Electrical Repair')).toBeInTheDocument()
  })

  it('shows a "Log in as a worker to apply" link for an unauthenticated visitor, never a dead Apply button', async () => {
    resetAuthStore()
    server.use(http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5 }))))

    renderJobDetail('/jobs/5')

    expect(await screen.findByRole('link', { name: 'Log in as a worker' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.queryByRole('button', { name: /^apply$/i })).not.toBeInTheDocument()
  })

  it('handles a 404 (not found / inactive) as "job unavailable", with a back-to-browse action', async () => {
    resetAuthStore()
    server.use(
      http.get(`${API_ROOT}/jobs/999/`, () =>
        HttpResponse.json({ detail: 'Job not found.' }, { status: 404 }),
      ),
    )

    renderJobDetail('/jobs/999')

    expect(await screen.findByText("This job isn't available anymore")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Browse' })).toHaveAttribute('href', '/jobs')
  })

  it('has no automatically-detectable accessibility violations', async () => {
    resetAuthStore()
    server.use(http.get(`${API_ROOT}/jobs/5/`, () => HttpResponse.json(buildJobFixture({ id: 5 }))))

    const { container } = renderJobDetail('/jobs/5')
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'House Wiring for New Apartment Block' }),
      ).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

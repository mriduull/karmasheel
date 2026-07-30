import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { resetAuthStore } from '@/test/utils'
import App from './App'

function mockLandingData() {
  server.use(
    http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json([])),
    http.get(`${API_ROOT}/jobs/browse/`, () => HttpResponse.json([])),
  )
}

describe('App', () => {
  it('boots with no stored session and renders the public landing page', async () => {
    resetAuthStore()
    localStorage.clear()
    mockLandingData()

    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Workforce Match' })).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /find honest local work/i }),
    ).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations on first render', async () => {
    resetAuthStore()
    localStorage.clear()
    mockLandingData()

    const { container } = render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Workforce Match' })).toBeInTheDocument(),
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

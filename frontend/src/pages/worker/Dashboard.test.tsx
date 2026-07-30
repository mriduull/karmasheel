import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildApplicationFixture, buildWorkerProfileFixture } from '@/test/fixtures'
import { WorkerDashboard } from './Dashboard'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_ramesh',
  email: 'ramesh@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

describe('WorkerDashboard', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
  })

  it("renders the authenticated Worker's username and shortcut cards", async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerDashboard />)

    expect(screen.getByRole('heading', { name: /welcome, demo_worker_ramesh/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /complete \/ edit profile/i })).toHaveAttribute(
      'href',
      '/worker/profile',
    )
    expect(screen.getByRole('link', { name: /browse jobs/i })).toHaveAttribute('href', '/jobs')
    expect(screen.getByRole('link', { name: /my applications/i })).toHaveAttribute(
      'href',
      '/worker/applications',
    )
  })

  it('shows a profile-readiness message for a complete profile', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerDashboard />)

    expect(await screen.findByText('Your profile is ready to show employers.')).toBeInTheDocument()
  })

  it('shows incomplete-profile guidance when required fields are missing', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(buildWorkerProfileFixture({ address: '', skills: [] })),
      ),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerDashboard />)

    expect(
      await screen.findByText('Add a few more details to get better matches.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/your address, at least one skill/i)).toBeInTheDocument()
  })

  it('shows the no-applications empty state with a Browse Jobs path', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerDashboard />)

    expect(await screen.findByText("You haven't applied to any jobs yet.")).toBeInTheDocument()
  })

  it('shows an application summary count when applications exist', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json([
          buildApplicationFixture({ id: 1, status: 'APPLIED' }),
          buildApplicationFixture({ id: 2, status: 'COMPLETED' }),
        ]),
      ),
    )

    renderWithProviders(<WorkerDashboard />)

    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.getByText(/applications total · 1 in progress/i)).toBeInTheDocument()
  })

  it('degrades the profile section independently when only the applications request fails', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.get(`${API_ROOT}/applications/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )

    renderWithProviders(<WorkerDashboard />)

    expect(await screen.findByText('Your profile is ready to show employers.')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('degrades the applications section independently when only the profile request fails', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([])),
    )

    renderWithProviders(<WorkerDashboard />)

    expect(await screen.findByText("You haven't applied to any jobs yet.")).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.get(`${API_ROOT}/applications/`, () => HttpResponse.json([buildApplicationFixture()])),
    )

    const { container } = renderWithProviders(<WorkerDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Your profile is ready to show employers.')).toBeInTheDocument()
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

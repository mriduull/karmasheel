import '@/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildWorkerProfileFixture } from '@/test/fixtures'
import { WorkerProfile } from './Profile'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_ramesh',
  email: 'ramesh@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

describe('WorkerProfile', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and displays the existing profile', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(buildWorkerProfileFixture({ address: 'Koteshwor, Kathmandu' })),
      ),
    )

    renderWithProviders(<WorkerProfile />)

    expect(await screen.findByDisplayValue('Koteshwor, Kathmandu')).toBeInTheDocument()
  })

  it('submits a valid PATCH for the Basics section and shows a saved confirmation', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          buildWorkerProfileFixture({ address: 'Baneshwor, Kathmandu', experience_years: 7 }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const addressInput = await screen.findByLabelText('Address')
    await user.clear(addressInput)
    await user.type(addressInput, 'Baneshwor, Kathmandu')

    const basicsForm = addressInput.closest('form') as HTMLFormElement
    await user.click(within(basicsForm).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(capturedBody).toEqual({ address: 'Baneshwor, Kathmandu', experience_years: 6 })
    })
    expect(within(basicsForm).getByText('Saved')).toBeInTheDocument()
  })

  it('shows a field validation error without calling the API', async () => {
    const user = userEvent.setup()
    let patchCalled = false

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.patch(`${API_ROOT}/profiles/worker/me/`, () => {
        patchCalled = true
        return HttpResponse.json(buildWorkerProfileFixture())
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const experienceInput = await screen.findByLabelText('Years of experience')
    await user.clear(experienceInput)
    await user.type(experienceInput, '-3')

    const basicsForm = experienceInput.closest('form') as HTMLFormElement
    await user.click(within(basicsForm).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter a whole number, zero or more.')).toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  it('displays confirmed standardized skills from the profile', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
          }),
        ),
      ),
    )

    renderWithProviders(<WorkerProfile />)

    const confirmedLabel = await screen.findByText('Confirmed standardized skills')
    // "House Wiring" legitimately appears twice: once as a pre-filled
    // chip in the editable skill input, once in the read-only confirmed
    // list — scope the query to the latter.
    expect(within(confirmedLabel.parentElement as HTMLElement).getByText('House Wiring')).toBeInTheDocument()
  })

  it('displays unmatched skill terms returned by a save, without discarding existing skills', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
          }),
        ),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
            unmatched_terms: ['cnc machine operation'],
          }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const skillInput = await screen.findByLabelText('Your skills')
    await user.type(skillInput, 'cnc machine operation')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const skillsForm = skillInput.closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))

    // The pre-filled existing skill travels along with the new phrase —
    // saving never silently drops it (the backend replaces the whole set).
    await waitFor(() => {
      expect(capturedBody).toEqual({ skill_input: ['House Wiring', 'cnc machine operation'] })
    })
    expect(await screen.findByText(/we couldn't confidently match/i)).toBeInTheDocument()
    expect(screen.getByText('cnc machine operation')).toBeInTheDocument()
  })

  it('does not block the form when geolocation permission is denied', async () => {
    const user = userEvent.setup()
    const getCurrentPosition = vi.fn((_success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1 })
    })
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
    )

    renderWithProviders(<WorkerProfile />)

    await user.click(await screen.findByRole('button', { name: /use my location/i }))

    expect(
      await screen.findByText(/location permission was declined/i),
    ).toBeInTheDocument()

    // The rest of the form remains fully usable.
    const addressInput = screen.getByLabelText('Address')
    expect(addressInput).not.toBeDisabled()
  })

  it('shows an API error state when the profile fails to load, with a retry action', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )

    renderWithProviders(<WorkerProfile />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
    )

    const { container } = renderWithProviders(<WorkerProfile />)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Save' }).length).toBeGreaterThan(0)
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

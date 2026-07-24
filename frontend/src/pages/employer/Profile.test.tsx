import '@/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildEmployerProfileFixture } from '@/test/fixtures'
import { EmployerProfile } from './Profile'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

describe('EmployerProfile', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and displays the existing profile', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ organization_name: 'Himal Builders' })),
      ),
    )

    renderWithProviders(<EmployerProfile />)

    expect(await screen.findByDisplayValue('Himal Builders')).toBeInTheDocument()
  })

  it('shows verification status read-only, with no request-verification control', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'PENDING' })),
      ),
    )

    renderWithProviders(<EmployerProfile />)

    expect(await screen.findByText('Verification pending')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request verification/i })).not.toBeInTheDocument()
  })

  it('submits a valid PATCH for the Business Details section, normalizing PAN/VAT formatting', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.patch(`${API_ROOT}/profiles/employer/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(buildEmployerProfileFixture({ pan_vat_number: '123456789' }))
      }),
    )

    renderWithProviders(<EmployerProfile />)

    const panInput = await screen.findByLabelText('PAN/VAT number')
    await user.clear(panInput)
    await user.type(panInput, '123-456-789')

    const detailsForm = panInput.closest('form') as HTMLFormElement
    await user.click(within(detailsForm).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(capturedBody).toEqual({
        organization_name: 'Kathmandu Home Services Pvt. Ltd.',
        address: 'Baneshwor, Kathmandu',
        pan_vat_number: '123456789',
      })
    })
    expect(within(detailsForm).getByText('Saved')).toBeInTheDocument()
  })

  it('shows a plain-language field error for an invalid PAN/VAT without calling the API', async () => {
    const user = userEvent.setup()
    let patchCalled = false

    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.patch(`${API_ROOT}/profiles/employer/me/`, () => {
        patchCalled = true
        return HttpResponse.json(buildEmployerProfileFixture())
      }),
    )

    renderWithProviders(<EmployerProfile />)

    const panInput = await screen.findByLabelText('PAN/VAT number')
    await user.clear(panInput)
    await user.type(panInput, '123')

    const detailsForm = panInput.closest('form') as HTMLFormElement
    await user.click(within(detailsForm).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Enter exactly 9 digits.')).toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  it('surfaces a backend duplicate-PAN/VAT error as a plain-language field error', async () => {
    const user = userEvent.setup()

    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
      http.patch(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json({ pan_vat_number: ['This PAN/VAT number is already registered.'] }, { status: 400 }),
      ),
    )

    renderWithProviders(<EmployerProfile />)

    const panInput = await screen.findByLabelText('PAN/VAT number')
    await user.clear(panInput)
    await user.type(panInput, '987654321')

    const detailsForm = panInput.closest('form') as HTMLFormElement
    await user.click(within(detailsForm).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('This PAN/VAT number is already registered.')).toBeInTheDocument()
  })

  it('does not block saving the Location section when geolocation permission is denied', async () => {
    const user = userEvent.setup()
    const getCurrentPosition = vi.fn((_success, error) => {
      error({ code: 1, PERMISSION_DENIED: 1 })
    })
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ latitude: null, longitude: null })),
      ),
    )

    renderWithProviders(<EmployerProfile />)

    await user.click(await screen.findByRole('button', { name: /use my location/i }))

    expect(await screen.findByText(/location permission was declined/i)).toBeInTheDocument()

    const saveButtons = screen.getAllByRole('button', { name: 'Save' })
    for (const button of saveButtons) {
      expect(button).not.toBeDisabled()
    }
  })

  it('preserves the previously saved location value across renders (no invented coordinates)', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ latitude: '27.693800', longitude: '85.335500' })),
      ),
    )

    renderWithProviders(<EmployerProfile />)

    expect(await screen.findByText('Location saved.')).toBeInTheDocument()
  })

  it('shows an API error state when the profile fails to load, with a retry action', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )

    renderWithProviders(<EmployerProfile />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
    )

    const { container } = renderWithProviders(<EmployerProfile />)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Save' }).length).toBeGreaterThan(0)
    })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

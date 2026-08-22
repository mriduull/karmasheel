import '@/i18n'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { createTestQueryClient, resetAuthStore } from '@/test/utils'
import { useAuthStore } from '@/state/authStore'
import { tokenStorage } from '@/api/tokenStorage'
import { Register } from './Register'

function Probe({ label }: { label: string }) {
  return <p>{label}</p>
}

function renderRegister(initialPath = '/register') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Probe label="login-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Register', () => {
  beforeEach(() => {
    resetAuthStore()
    localStorage.clear()
  })

  it('renders a prominent Worker/Employer role selector, defaulting to Worker', () => {
    renderRegister()

    const workerOption = screen.getByRole('radio', { name: 'Worker' })
    const employerOption = screen.getByRole('radio', { name: 'Employer' })

    expect(workerOption).toHaveAttribute('aria-checked', 'true')
    expect(employerOption).toHaveAttribute('aria-checked', 'false')
  })

  it('preselects Employer when arriving from the "Hire Workers" link (?role=EMPLOYER)', () => {
    renderRegister('/register?role=EMPLOYER')

    expect(screen.getByRole('radio', { name: 'Employer' })).toHaveAttribute('aria-checked', 'true')
  })

  it('marks registration fields with distinct autocomplete purposes', () => {
    const { container } = renderRegister()

    expect(screen.getByLabelText('Username')).toHaveAttribute(
      'autocomplete',
      'section-register nickname',
    )
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'autocomplete',
      'section-register email',
    )
    expect(screen.getByLabelText('Phone number')).toHaveAttribute(
      'autocomplete',
      'section-register tel-national',
    )
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'section-register new-password',
    )

    const autofillOrder = Array.from(container.querySelectorAll('input')).map((input) =>
      input.getAttribute('autocomplete'),
    )
    expect(autofillOrder.slice(0, 4)).toEqual([
      'section-register nickname',
      'section-register new-password',
      'section-register email',
      'section-register tel-national',
    ])
  })

  it('shows client-side validation errors for empty required fields', async () => {
    const user = userEvent.setup()
    renderRegister()

    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Username is required.')).toBeInTheDocument()
    expect(screen.getByText('Phone number is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
  })

  it('rejects numeric-only and too-long usernames before submitting', async () => {
    const user = userEvent.setup()
    renderRegister()

    const usernameInput = screen.getByLabelText('Username')
    await user.type(usernameInput, '1234567890')
    await user.type(screen.getByLabelText('Phone number'), '9811111111')
    await user.type(screen.getByLabelText('Password'), 'SecurePassword123!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Username must include at least one letter.')).toBeInTheDocument()

    await user.clear(usernameInput)
    await user.type(usernameInput, 'workername123456789012345678901')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Username must be 30 characters or fewer.')).toBeInTheDocument()
  })

  it('shows a minimum-length error for a too-short (but non-empty) password', async () => {
    const user = userEvent.setup()
    renderRegister()

    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Must be at least 8 characters.')).toBeInTheDocument()
  })

  it('submits only real backend fields and shows the confirmation-then-redirect flow, never auto-logging in', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null

    server.use(
      http.post(`${API_ROOT}/auth/register/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          {
            id: 10,
            username: 'newworker',
            email: '',
            phone_number: '9811111111',
            role: 'WORKER',
          },
          { status: 201 },
        )
      }),
    )

    renderRegister()

    await user.type(screen.getByLabelText('Username'), 'newworker')
    await user.type(screen.getByLabelText('Phone number'), '9811111111')
    await user.type(screen.getByLabelText('Password'), 'SecurePassword123!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Account created' })).toBeInTheDocument()

    // No auto-login: no token stored, request carried only real fields.
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(tokenStorage.getRefreshToken()).toBeNull()
    expect(capturedBody).toEqual({
      username: 'newworker',
      phone_number: '9811111111',
      password: 'SecurePassword123!',
      role: 'WORKER',
    })

    await user.click(screen.getByRole('button', { name: 'Continue to Log In' }))
    expect(await screen.findByText('login-page')).toBeInTheDocument()
  })

  it('translates field-keyed DRF errors (e.g. duplicate phone number) into plain-language field messages', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(`${API_ROOT}/auth/register/`, () =>
        HttpResponse.json(
          { phone_number: ['user with this phone number already exists.'] },
          { status: 400 },
        ),
      ),
    )

    renderRegister()

    await user.type(screen.getByLabelText('Username'), 'anotheruser')
    await user.type(screen.getByLabelText('Phone number'), '9844444444')
    await user.type(screen.getByLabelText('Password'), 'SecurePassword123!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('user with this phone number already exists.'),
    ).toBeInTheDocument()
    // Still on the form, not the confirmation screen.
    expect(screen.queryByRole('heading', { name: 'Account created' })).not.toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    const { container } = renderRegister()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

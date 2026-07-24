import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { CATEGORY_FIXTURES, SUBCATEGORY_FIXTURES, buildEmployerJobFixture } from '@/test/fixtures'
import { JobForm } from './JobForm'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

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

async function fillRequiredBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'Deep Cleaning for New Office')
  await user.type(screen.getByLabelText('Description'), 'Full office deep clean, two floors.')

  const categorySelect = await screen.findByLabelText('Category')
  await within(categorySelect).findByRole('option', { name: 'Construction & Repair' })
  await user.selectOptions(categorySelect, '1')

  const subcategorySelect = screen.getByLabelText('Subcategory')
  await within(subcategorySelect).findByRole('option', { name: 'Electrical' })
  await user.selectOptions(subcategorySelect, '1')

  await user.type(screen.getByLabelText('Address'), 'Baneshwor, Kathmandu')
  await user.type(screen.getByLabelText('Latitude'), '27.6938')
  await user.type(screen.getByLabelText('Longitude'), '85.3355')
  await user.type(screen.getByLabelText('Wage amount'), '1500')
}

describe('JobForm', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
    mockTaxonomy()
  })

  describe('create mode', () => {
    it('requires Title, Description, Category, Subcategory, Address, Latitude, Longitude, and Wage amount', async () => {
      const user = userEvent.setup()
      let postCalled = false
      server.use(
        http.post(`${API_ROOT}/jobs/`, () => {
          postCalled = true
          return HttpResponse.json(buildEmployerJobFixture())
        }),
      )

      renderWithProviders(<JobForm mode="create" />)

      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(await screen.findByText('Title is required.')).toBeInTheDocument()
      expect(screen.getByText('Description is required.')).toBeInTheDocument()
      expect(screen.getByText('Choose a category.')).toBeInTheDocument()
      expect(screen.getByText('Address is required.')).toBeInTheDocument()
      expect(screen.getByText('Latitude is required.')).toBeInTheDocument()
      expect(screen.getByText('Longitude is required.')).toBeInTheDocument()
      expect(screen.getByText('Wage amount is required.')).toBeInTheDocument()
      expect(postCalled).toBe(false)
    })

    it('resets the subcategory when the category changes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<JobForm mode="create" />)

      const categorySelect = await screen.findByLabelText('Category')
      await within(categorySelect).findByRole('option', { name: 'Construction & Repair' })
      await user.selectOptions(categorySelect, '1')

      const subcategorySelect = screen.getByLabelText('Subcategory')
      await within(subcategorySelect).findByRole('option', { name: 'Electrical' })
      await user.selectOptions(subcategorySelect, '1')
      expect(subcategorySelect).toHaveValue('1')

      await user.selectOptions(screen.getByLabelText('Category'), '2')
      expect(screen.getByLabelText('Subcategory')).toHaveValue('')
    })

    it('rejects an application deadline in the past on create', async () => {
      const user = userEvent.setup()
      renderWithProviders(<JobForm mode="create" />)

      await fillRequiredBasics(user);
      const deadlineInput = screen.getByLabelText('Application deadline')
      await user.type(deadlineInput, '2020-01-01T09:00')

      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(
        await screen.findByText('Application deadline cannot be in the past.'),
      ).toBeInTheDocument()
    })

    it('adds and removes skill chips, submitting them as required_skills_input/preferred_skills_input', async () => {
      const user = userEvent.setup()
      let capturedBody: Record<string, unknown> | null = null

      server.use(
        http.post(`${API_ROOT}/jobs/`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(buildEmployerJobFixture())
        }),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)

      const requiredSkillInput = screen.getByLabelText('Required skills')
      await user.type(requiredSkillInput, 'House Wiring')
      await user.click(within(requiredSkillInput.closest('div') as HTMLElement).getByRole('button', { name: 'Add' }))

      const preferredSkillInput = screen.getByLabelText('Preferred skills')
      await user.type(preferredSkillInput, 'Electrical Repair')
      await user.click(
        within(preferredSkillInput.closest('div') as HTMLElement).getByRole('button', { name: 'Add' }),
      )

      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      await waitFor(() => expect(capturedBody).not.toBeNull())
      expect(capturedBody).toMatchObject({
        required_skills_input: ['House Wiring'],
        preferred_skills_input: ['Electrical Repair'],
      })
    })

    it('never sends a status field on create — a new job always starts ACTIVE server-side', async () => {
      const user = userEvent.setup()
      let capturedBody: Record<string, unknown> | null = null

      server.use(
        http.post(`${API_ROOT}/jobs/`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(buildEmployerJobFixture())
        }),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)
      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      await waitFor(() => expect(capturedBody).not.toBeNull())
      expect(capturedBody).not.toHaveProperty('status')
    })

    it('redirects immediately to the new Job Detail page when there are no unmatched terms', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`${API_ROOT}/jobs/`, () =>
          HttpResponse.json(buildEmployerJobFixture({ id: 77, unmatched_required_terms: [], unmatched_preferred_terms: [] })),
        ),
      )

      renderWithProviders(
        <Routes>
          <Route path="/employer/jobs/new" element={<JobForm mode="create" />} />
          <Route path="/employer/jobs/:id" element={<p>OWNER JOB DETAIL PAGE 77</p>} />
        </Routes>,
        { route: '/employer/jobs/new' },
      )
      await fillRequiredBasics(user)
      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(await screen.findByText('OWNER JOB DETAIL PAGE 77')).toBeInTheDocument()
    })

    it('stays on the page and shows the unmatched-term notice instead of auto-redirecting', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`${API_ROOT}/jobs/`, () =>
          HttpResponse.json(
            buildEmployerJobFixture({ id: 77, unmatched_required_terms: ['cnc machine operation'] }),
          ),
        ),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)
      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(await screen.findByText('Job published.')).toBeInTheDocument()
      expect(screen.getByText(/we couldn't confidently match/i)).toBeInTheDocument()
      expect(screen.getByText('cnc machine operation')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'View Job' })).toBeInTheDocument()
    })

    it('shows a verification-specific message on a 403 without crashing', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`${API_ROOT}/jobs/`, () =>
          HttpResponse.json({ detail: 'Your account is not verified.' }, { status: 403 }),
        ),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)
      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(await screen.findByText('Your account is not verified.')).toBeInTheDocument()
    })

    it('maps backend field errors onto the matching form fields', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`${API_ROOT}/jobs/`, () =>
          HttpResponse.json({ wage_amount: ['Must be zero or more.'] }, { status: 400 }),
        ),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)
      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(await screen.findByText('Must be zero or more.')).toBeInTheDocument()
    })

    it('disables the submit button while a create request is in flight (no duplicate submit)', async () => {
      const user = userEvent.setup()
      const state: { resolveRequest: (() => void) | null } = { resolveRequest: null }

      server.use(
        http.post(`${API_ROOT}/jobs/`, async () => {
          await new Promise<void>((resolve) => {
            state.resolveRequest = resolve
          })
          return HttpResponse.json(buildEmployerJobFixture())
        }),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)

      const submitButton = screen.getByRole('button', { name: 'Publish job' })
      await user.click(submitButton)

      await waitFor(() => expect(submitButton).toBeDisabled())
      state.resolveRequest?.()
    })
  })

  describe('edit mode', () => {
    it('pre-fills every field, including existing skills, from the passed-in job', async () => {
      const job = buildEmployerJobFixture({
        title: 'Existing Job Title',
        required_skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
        preferred_skills: [{ id: 4, name: 'Electrical Repair', subcategory: 'Electrical' }],
      })

      renderWithProviders(<JobForm mode="edit" job={job} />)

      expect(await screen.findByDisplayValue('Existing Job Title')).toBeInTheDocument()
      expect(screen.getByText('House Wiring')).toBeInTheDocument()
      expect(screen.getByText('Electrical Repair')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    })

    it('submits a PATCH carrying the current (pre-filled) skill set, never dropping unedited skills', async () => {
      const user = userEvent.setup()
      let capturedBody: Record<string, unknown> | null = null
      const job = buildEmployerJobFixture({
        id: 9,
        required_skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
      })

      server.use(
        http.patch(`${API_ROOT}/jobs/9/`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(job)
        }),
      )

      renderWithProviders(<JobForm mode="edit" job={job} />)
      await screen.findByDisplayValue(job.title)

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(capturedBody).not.toBeNull())
      expect(capturedBody).toMatchObject({ required_skills_input: ['House Wiring'] })
    })

    it('never offers ACTIVE as a settable status and never sends status on edit at all', async () => {
      const user = userEvent.setup()
      let capturedBody: Record<string, unknown> | null = null
      const job = buildEmployerJobFixture({ id: 9, status: 'CLOSED' })

      server.use(
        http.patch(`${API_ROOT}/jobs/9/`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(job)
        }),
      )

      renderWithProviders(<JobForm mode="edit" job={job} />)
      await screen.findByDisplayValue(job.title)
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(capturedBody).not.toBeNull())
      expect(capturedBody).not.toHaveProperty('status')
    })

    it('does not re-validate the deadline as "in the past" on edit', async () => {
      const user = userEvent.setup()
      const job = buildEmployerJobFixture({ id: 9, application_deadline: '2020-01-01T09:00:00Z' })

      server.use(http.patch(`${API_ROOT}/jobs/9/`, () => HttpResponse.json(job)))

      renderWithProviders(<JobForm mode="edit" job={job} />)
      await screen.findByDisplayValue(job.title)
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(screen.queryByText('Application deadline cannot be in the past.')).not.toBeInTheDocument()
    })
  })

  it('has no automatically-detectable accessibility violations', async () => {
    const { container } = renderWithProviders(<JobForm mode="create" />)
    await screen.findByLabelText('Category')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

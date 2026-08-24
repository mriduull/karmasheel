import '@/i18n'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('react-leaflet', () => import('@/test/mocks/reactLeaflet'))

vi.mock('@/lib/geoapify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/geoapify')>()
  return {
    ...actual,
    searchPlaces: vi.fn().mockResolvedValue([]),
    reverseGeocode: vi.fn().mockResolvedValue('Baneshwor, Kathmandu, Nepal'),
  }
})

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
    http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([])),
    http.get(`${API_ROOT}/taxonomy/categories/`, () => HttpResponse.json(CATEGORY_FIXTURES)),
    http.get(`${API_ROOT}/taxonomy/subcategories/`, ({ request }) => {
      const url = new URL(request.url)
      const categoryId = url.searchParams.get('category')
      const filtered = categoryId
        ? SUBCATEGORY_FIXTURES.filter((sub) => String(sub.category) === categoryId)
        : SUBCATEGORY_FIXTURES
      return HttpResponse.json(filtered)
    }),
    http.post(`${API_ROOT}/taxonomy/infer-job-category/`, async ({ request }) => {
      const body = (await request.json()) as {
        required_skills?: string[]
        preferred_skills?: string[]
      }
      const terms = [...(body.required_skills ?? []), ...(body.preferred_skills ?? [])].map((term) =>
        term.toLowerCase(),
      )

      if (terms.includes('ghar wiring') || terms.includes('house wiring')) {
        return HttpResponse.json({
          category: 1,
          category_name: 'Construction & Repair',
          subcategory: 1,
          subcategory_name: 'Electrical',
          matched_terms: [
            {
              term: 'ghar wiring',
              source: 'required_skill',
              skill_id: 2,
              skill_name: 'House Wiring',
              subcategory: 1,
              subcategory_name: 'Electrical',
              category: 1,
              category_name: 'Construction & Repair',
              confidence: 100,
              method: 'exact_alias',
              suggestions: [
                { id: 2, name: 'House Wiring', subcategory: 'Electrical', confidence: 100 },
              ],
              is_confident_match: true,
            },
          ],
          confidence: 100,
          suggested_terms: [],
        })
      }

      return HttpResponse.json({
        category: null,
        category_name: null,
        subcategory: null,
        subcategory_name: null,
        matched_terms: [],
        confidence: 0,
        suggested_terms: [],
      })
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

  await user.click(screen.getByRole('button', { name: 'Simulate map click' }))
  await screen.findByText('Baneshwor, Kathmandu, Nepal')
  await user.type(screen.getByLabelText('Wage amount'), '1500')
}

describe('JobForm', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
    mockTaxonomy()
  })

  describe('create mode', () => {
    it('requires Title, Description, Category, Subcategory, Location, and Wage amount', async () => {
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
      expect(screen.getByText(/select a location for this job/i)).toBeInTheDocument()
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

    it('auto-selects category and subcategory from employer-entered skills', async () => {
      const user = userEvent.setup()
      renderWithProviders(<JobForm mode="create" />)

      const categorySelect = await screen.findByLabelText('Category')
      await within(categorySelect).findByRole('option', { name: 'Domestic & Local Services' })
      await user.selectOptions(categorySelect, '2')

      const subcategorySelect = screen.getByLabelText('Subcategory')
      await within(subcategorySelect).findByRole('option', { name: 'Cleaning' })
      await user.selectOptions(subcategorySelect, '3')

      const requiredSkillInput = screen.getByLabelText('Required skills')
      await user.type(requiredSkillInput, 'Ghar wiring')
      await user.click(within(requiredSkillInput.closest('div') as HTMLElement).getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByLabelText('Category')).toHaveValue('1')
        expect(screen.getByLabelText('Subcategory')).toHaveValue('1')
      })
      expect(screen.getByText(/auto-selected electrical based on house wiring/i)).toBeInTheDocument()
    })

    it('places skill inputs before category and explains automatic taxonomy mapping', async () => {
      renderWithProviders(<JobForm mode="create" />)

      const requiredSkills = screen.getByLabelText('Required skills')
      const preferredSkills = screen.getByLabelText('Preferred skills')
      const category = await screen.findByLabelText('Category')
      const subcategory = screen.getByLabelText('Subcategory')

      expect(requiredSkills.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(preferredSkills.compareDocumentPosition(subcategory) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.getByText(/recognized skills automatically select the matching category and subcategory/i)).toBeInTheDocument()
    })

    it('shows clickable canonical matches for both required and preferred phrases', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`${API_ROOT}/taxonomy/infer-job-category/`, () => HttpResponse.json({
          category: 9,
          category_name: 'Security Services',
          subcategory: 20,
          subcategory_name: 'Access Control & Surveillance',
          confidence: 60,
          suggested_terms: [],
          matched_terms: [
            {
              term: 'Aces Card managment', source: 'required_skill', skill_id: 20,
              skill_name: 'Access Card Management', subcategory: 20,
              subcategory_name: 'Access Control & Surveillance', category: 9,
              category_name: 'Security Services', confidence: 87, method: 'fuzzy',
              is_confident_match: true,
              suggestions: [{ id: 20, name: 'Access Card Management', subcategory: 'Access Control & Surveillance', confidence: 87 }],
            },
            {
              term: 'aaunsadi samjhaune', source: 'preferred_skill', skill_id: 21,
              skill_name: 'Medication Reminder Support', subcategory: 30,
              subcategory_name: 'Elderly Care', category: 10,
              category_name: 'Care Services', confidence: 91, method: 'fuzzy',
              is_confident_match: true,
              suggestions: [
                { id: 21, name: 'Medication Reminder Support', subcategory: 'Elderly Care', confidence: 91 },
                { id: 22, name: 'Medicine Pickup Support', subcategory: 'Elderly Care', confidence: 72 },
              ],
            },
          ],
        })),
      )
      renderWithProviders(<JobForm mode="create" />)

      for (const [label, phrase] of [['Required skills', 'Aces Card managment'], ['Preferred skills', 'aaunsadi samjhaune']] as const) {
        const input = screen.getByLabelText(label)
        await user.type(input, phrase)
        await user.click(within(input.closest('div') as HTMLElement).getByRole('button', { name: 'Add' }))
      }

      const preferredMatch = await screen.findByText('Medication Reminder Support', { selector: 'summary' })
      await user.click(preferredMatch)
      const details = preferredMatch.closest('details') as HTMLElement
      expect(within(details).getByText((_, element) => element?.tagName === 'P' && (element.textContent?.includes('aaunsadi samjhaune') ?? false))).toBeInTheDocument()
      expect(within(details).getByText(/91% confidence/i)).toBeInTheDocument()
      expect(within(details).getByText(/Medicine Pickup Support \(72%\)/i)).toBeInTheDocument()
      await user.click(within(details).getByRole('button', { name: 'Use suggested skill Medicine Pickup Support' }))
      expect(screen.getByRole('button', { name: 'Remove Medicine Pickup Support' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove aaunsadi samjhaune' })).not.toBeInTheDocument()
    })

    it('shows and applies a tentative canonical suggestion for a lower-confidence spelling', async () => {
      const user = userEvent.setup()
      server.use(
        http.post(`${API_ROOT}/taxonomy/infer-job-category/`, () => HttpResponse.json({
          category: null,
          category_name: null,
          subcategory: null,
          subcategory_name: null,
          confidence: 0,
          matched_terms: [],
          suggested_terms: [{
            term: 'batan fixing', source: 'required_skill', skill_id: 30,
            skill_name: 'Button Fixing', subcategory: 40,
            subcategory_name: 'Alterations & Repair', category: 12,
            category_name: 'Tailoring & Garment Work', confidence: 80,
            method: 'unmatched', is_confident_match: false,
            suggestions: [
              { id: 30, name: 'Button Fixing', subcategory: 'Alterations & Repair', confidence: 80 },
              { id: 31, name: 'Steel Fixing', subcategory: 'Structural Work', confidence: 75 },
            ],
          }],
        })),
      )
      renderWithProviders(<JobForm mode="create" />)
      const input = screen.getByLabelText('Required skills')
      await user.type(input, 'batan fixing')
      await user.click(within(input.closest('div') as HTMLElement).getByRole('button', { name: 'Add' }))

      const summary = await screen.findByText(/possible match: button fixing/i, { selector: 'summary' })
      await user.click(summary)
      expect(summary.closest('details')).toHaveTextContent('You entered “batan fixing”')
      await user.click(screen.getByRole('button', { name: 'Use Button Fixing' }))

      expect(screen.getByRole('button', { name: 'Remove Button Fixing' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove batan fixing' })).not.toBeInTheDocument()
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

    it('requires the application deadline to be earlier than the scheduled start', async () => {
      const user = userEvent.setup()
      let postCalled = false
      server.use(
        http.post(`${API_ROOT}/jobs/`, () => {
          postCalled = true
          return HttpResponse.json(buildEmployerJobFixture())
        }),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)
      await user.type(screen.getByLabelText('Scheduled start'), '2099-08-27T15:00')
      await user.type(screen.getByLabelText('Application deadline'), '2099-08-29T15:00')

      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(
        await screen.findByText('Application deadline must be earlier than the scheduled start.'),
      ).toBeInTheDocument()
      expect(postCalled).toBe(false)
    })

    it('duplicates reusable details from a previous job but leaves both dates blank', async () => {
      const user = userEvent.setup()
      const previousJob = buildEmployerJobFixture({
        id: 42,
        title: 'Electrician Needed for House Wiring',
        description: 'Need an electrician for house wiring and switch installation.',
        required_skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
        preferred_skills: [{ id: 8, name: 'Switch Installation', subcategory: 'Electrical' }],
        address: 'Patan, Lalitpur',
        latitude: '27.683219',
        longitude: '85.327463',
        wage_type: 'DAILY',
        wage_amount: '1800.00',
        work_type: 'ONE_TIME',
        required_experience_years: 1,
        number_of_workers_required: 1,
        duration_days: 1,
        scheduled_datetime: '2099-08-27T09:15:00Z',
        application_deadline: '2099-08-26T09:15:00Z',
      })
      server.use(http.get(`${API_ROOT}/jobs/`, () => HttpResponse.json([previousJob])))

      renderWithProviders(<JobForm mode="create" />)

      await user.type(screen.getByLabelText('Required skills'), 'stale required draft')
      await user.type(screen.getByLabelText('Preferred skills'), 'stale preferred draft')
      const previousJobSelect = await screen.findByLabelText('Previous job')
      await within(previousJobSelect).findByRole('option', { name: previousJob.title })
      await user.selectOptions(previousJobSelect, String(previousJob.id))
      await user.click(screen.getByRole('button', { name: 'Use Previous Job' }))

      expect(screen.getByLabelText('Title')).toHaveValue(previousJob.title)
      expect(screen.getByLabelText('Description')).toHaveValue(previousJob.description)
      const locationSection = screen.getByRole('heading', { name: 'Location' }).closest('section') as HTMLElement
      expect(within(locationSection).getByText('Patan, Lalitpur')).toBeInTheDocument()
      expect(within(locationSection).getByText('27.683219', { exact: false })).toBeInTheDocument()
      expect(within(locationSection).getByText('85.327463', { exact: false })).toBeInTheDocument()
      expect(screen.getByLabelText('Wage type')).toHaveValue('DAILY')
      expect(screen.getByLabelText('Wage amount')).toHaveValue('1800.00')
      expect(screen.getByLabelText('Work type')).toHaveValue('ONE_TIME')
      expect(screen.getByLabelText('Required experience (years)')).toHaveValue('1')
      expect(screen.getByLabelText('Number of workers needed')).toHaveValue('1')
      expect(screen.getByLabelText('Duration (days)')).toHaveValue('1')
      expect(screen.getByRole('button', { name: 'Remove House Wiring' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove Switch Installation' })).toBeInTheDocument()
      expect(screen.getByLabelText('Required skills')).toHaveValue('')
      expect(screen.getByLabelText('Preferred skills')).toHaveValue('')
      expect(screen.getByLabelText('Scheduled start')).toHaveValue('')
      expect(screen.getByLabelText('Application deadline')).toHaveValue('')
      const duplicateSection = screen.getByRole('heading', { name: 'Duplicate Job' }).closest('section') as HTMLElement
      expect(within(duplicateSection).getByRole('status')).toHaveTextContent(
        'Enter a new scheduled start and application deadline before publishing.',
      )
    })

    it('renders em dashes without mojibake', async () => {
      const { container } = renderWithProviders(<JobForm mode="create" />)

      expect(
        screen.getByText(/publish it — there is no draft state/i),
      ).toBeInTheDocument()
      expect(screen.getByText('Optional — leave blank to remove')).toBeInTheDocument()
      expect(container).not.toHaveTextContent('\u00e2')
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

    it('lets an employer review a fuzzy skill match and send the original phrase to admin review', async () => {
      const user = userEvent.setup()
      const accessCard = { id: 20, name: 'Access Card Management', subcategory: 'Electrical' }
      let patchBody: Record<string, unknown> | null = null
      server.use(
        http.post(`${API_ROOT}/jobs/`, () =>
          HttpResponse.json(buildEmployerJobFixture({
            id: 77,
            required_skills: [accessCard],
            preferred_skills: [],
            required_skill_matches: [{
              input_term: 'Aces card mangmnt',
              method: 'fuzzy',
              confidence: 87.18,
              matched_skill: accessCard,
              matched_skill_was_selected: true,
              suggestions: [{ ...accessCard, confidence: 87.18 }],
            }],
          })),
        ),
        http.patch(`${API_ROOT}/jobs/77/`, async ({ request }) => {
          patchBody = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(buildEmployerJobFixture({
            id: 77,
            required_skills: [],
            preferred_skills: [],
            unmatched_required_terms: ['Aces card mangmnt'],
          }))
        }),
      )

      renderWithProviders(<JobForm mode="create" />)
      await fillRequiredBasics(user)
      const input = screen.getByLabelText('Required skills')
      await user.type(input, 'Aces card mangmnt')
      await user.click(within(input.closest('div') as HTMLElement).getByRole('button', { name: 'Add' }))
      await user.click(screen.getByRole('button', { name: 'Publish job' }))

      expect(await screen.findByRole('region', { name: 'Review match for Aces card mangmnt' })).toBeInTheDocument()
      expect(screen.getByText(/matched to/i)).toHaveTextContent('Access Card Management')
      await user.click(screen.getByRole('button', { name: 'Remove this match and send original for review' }))
      await user.click(screen.getByRole('button', { name: 'Save skill decisions' }))

      await waitFor(() => expect(patchBody).not.toBeNull())
      expect(patchBody).toMatchObject({
        required_skills_input: [],
        required_skills_review_input: ['Aces card mangmnt'],
      })
      expect(await screen.findByText('Skill decisions saved.')).toBeInTheDocument()
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

    it('submits the picked address/latitude/longitude together as one payload', async () => {
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
      expect(capturedBody).toMatchObject({
        address: 'Baneshwor, Kathmandu, Nepal',
        latitude: 27.7005,
        longitude: 85.301,
      })
    })

    it('fills the job location from the employer profile via the convenience button, still adjustable', async () => {
      const user = userEvent.setup()
      renderWithProviders(<JobForm mode="create" />)

      await user.click(await screen.findByRole('button', { name: 'Use employer profile location' }))

      expect(await screen.findByText('Baneshwor, Kathmandu')).toBeInTheDocument()
      expect(screen.getByText('27.693800', { exact: false })).toBeInTheDocument()

      // Still adjustable afterwards — clicking the map moves it again.
      await user.click(screen.getByRole('button', { name: 'Simulate map click' }))
      expect(await screen.findByText('Baneshwor, Kathmandu, Nepal')).toBeInTheDocument()
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
      expect(screen.getByText(job.address)).toBeInTheDocument()
      expect(screen.getByText('27.693800', { exact: false })).toBeInTheDocument()
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

    it('still validates deadline order on edit', async () => {
      const user = userEvent.setup()
      let patchCalled = false
      const job = buildEmployerJobFixture({
        id: 9,
        scheduled_datetime: '2099-08-27T09:15:00Z',
        application_deadline: '2099-08-29T09:15:00Z',
      })

      server.use(
        http.patch(`${API_ROOT}/jobs/9/`, () => {
          patchCalled = true
          return HttpResponse.json(job)
        }),
      )

      renderWithProviders(<JobForm mode="edit" job={job} />)
      await screen.findByDisplayValue(job.title)
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(
        await screen.findByText('Application deadline must be earlier than the scheduled start.'),
      ).toBeInTheDocument()
      expect(patchCalled).toBe(false)
    })
  })

  it('has no automatically-detectable accessibility violations', async () => {
    const { container } = renderWithProviders(<JobForm mode="create" />)
    const categorySelect = await screen.findByLabelText('Category')
    // The select itself exists before its taxonomy query settles. Wait for
    // a fetched option so that update cannot race with the axe scan.
    await within(categorySelect).findByRole('option', { name: 'Construction & Repair' })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

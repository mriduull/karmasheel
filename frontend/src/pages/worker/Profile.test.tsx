import '@/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildWorkerProfileFixture, CATEGORY_TREE_FIXTURES } from '@/test/fixtures'
import { WorkerProfile } from './Profile'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

describe('WorkerProfile', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
    URL.createObjectURL = vi.fn(() => 'blob:profile-photo') as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
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

  it('displays selected standardized skills from the profile', async () => {
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

    const selectedList = await screen.findByRole('list', {
      name: 'Selected standardized skills',
    })
    expect(within(selectedList).getByText('House Wiring')).toBeInTheDocument()
    expect(within(selectedList).getByText('(Electrical)')).toBeInTheDocument()
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

    // Existing standardized skills travel by ID while only the newly typed
    // phrase is submitted as free text.
    await waitFor(() => {
      expect(capturedBody).toEqual({
        skill_input: ['cnc machine operation'],
        skill_ids: [2],
      })
    })
    expect(await screen.findByText(/we couldn't confidently match/i)).toBeInTheDocument()
    expect(screen.getByText('cnc machine operation')).toBeInTheDocument()
  })

  it('uploads a profile photo as multipart form data', async () => {
    const user = userEvent.setup()
    let capturedBody = ''

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.text()
        return HttpResponse.json(
          buildWorkerProfileFixture({
            profile_photo: '/media/worker_profile_photos/profile.png',
            profile_photo_url: 'http://testserver/media/worker_profile_photos/profile.png',
          }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const input = await screen.findByLabelText('Profile photo')
    await user.upload(input, new File(['image bytes'], 'profile.png', { type: 'image/png' }))

    const form = input.closest('form') as HTMLFormElement
    await user.click(within(form).getByRole('button', { name: /upload photo/i }))

    await waitFor(() => {
      expect(capturedBody).toContain('name="profile_photo"')
      expect(capturedBody).toContain('Content-Type: image/png')
    })
    expect(within(form).getByText('Saved')).toBeInTheDocument()
  })

  it('saves a typed skill draft when the user clicks Save without clicking Add first', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(buildWorkerProfileFixture({ skills: [] })),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
          }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const skillInput = await screen.findByLabelText('Your skills')
    await user.type(skillInput, 'ghar wiring')

    const skillsForm = skillInput.closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(capturedBody).toEqual({ skill_input: ['ghar wiring'], skill_ids: [] })
    })
    expect(await screen.findByText('Selected standardized skills')).toBeInTheDocument()
    expect(screen.getAllByText('House Wiring').length).toBeGreaterThan(0)
  })

  it('explains a fuzzy skill match and lets the worker replace it with a similar skill', async () => {
    const user = userEvent.setup()
    const capturedBodies: unknown[] = []

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(buildWorkerProfileFixture({ skills: [] })),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBodies.push(await request.json())

        if (capturedBodies.length === 1) {
          return HttpResponse.json(
            buildWorkerProfileFixture({
              skills: [{ id: 8, name: 'Electrical Panel Wiring', subcategory: 'Electrical' }],
              skill_matches: [
                {
                  input_term: 'sarkit wiring',
                  method: 'fuzzy',
                  confidence: 85.5,
                  matched_skill_was_selected: false,
                  matched_skill: {
                    id: 8,
                    name: 'Electrical Panel Wiring',
                    subcategory: 'Electrical',
                  },
                  suggestions: [
                    {
                      id: 8,
                      name: 'Electrical Panel Wiring',
                      subcategory: 'Electrical',
                      confidence: 85.5,
                    },
                    { id: 2, name: 'House Wiring', subcategory: 'Electrical', confidence: 75 },
                  ],
                },
              ],
            }),
          )
        }

        return HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
          }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const input = await screen.findByLabelText('Your skills')
    await user.type(input, 'sarkit wiring')
    const skillsForm = input.closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))

    const review = await screen.findByRole('region', { name: 'Review match for sarkit wiring' })
    expect(review).toHaveTextContent(
      '“sarkit wiring” was matched to Electrical Panel Wiring (86% match).',
    )

    await user.click(within(review).getByRole('button', { name: 'House Wiring (75%)' }))
    expect(screen.getByText('House Wiring selected. Save this section to apply the change.')).toBeInTheDocument()
    expect(within(skillsForm).queryByText('Saved')).not.toBeInTheDocument()

    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(capturedBodies).toEqual([
        { skill_input: ['sarkit wiring'], skill_ids: [] },
        { skill_input: [], skill_ids: [2] },
      ])
    })
  })

  it('lets the worker remove an automatic match and send the original phrase for review', async () => {
    const user = userEvent.setup()
    const capturedBodies: unknown[] = []

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(buildWorkerProfileFixture({ skills: [] })),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBodies.push(await request.json())

        if (capturedBodies.length === 1) {
          return HttpResponse.json(
            buildWorkerProfileFixture({
              skills: [{ id: 8, name: 'Electrical Panel Wiring', subcategory: 'Electrical' }],
              skill_matches: [
                {
                  input_term: 'sarkit wiring',
                  method: 'fuzzy',
                  confidence: 85.5,
                  matched_skill_was_selected: false,
                  matched_skill: {
                    id: 8,
                    name: 'Electrical Panel Wiring',
                    subcategory: 'Electrical',
                  },
                  suggestions: [],
                },
              ],
            }),
          )
        }

        return HttpResponse.json(
          buildWorkerProfileFixture({ skills: [], unmatched_terms: ['sarkit wiring'] }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const input = await screen.findByLabelText('Your skills')
    await user.type(input, 'sarkit wiring')
    const skillsForm = input.closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))

    const reviewButton = await screen.findByRole('button', {
      name: 'Remove this match and send original for review',
    })
    await user.click(reviewButton)
    const queuedReview = screen.getByRole('status', {
      name: 'Skill reviews waiting to be saved',
    })
    expect(queuedReview).toHaveTextContent('“sarkit wiring” will be sent when you save')
    expect(within(queuedReview).getByRole('button', { name: 'Cancel review for sarkit wiring' }))
      .toBeInTheDocument()

    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(capturedBodies[1]).toEqual({
        skill_input: [],
        skill_ids: [],
        skill_review_input: ['sarkit wiring'],
      })
    })
    expect(await screen.findByText('Review request recorded')).toBeInTheDocument()
    expect(screen.queryByText(/we couldn't confidently match/i)).not.toBeInTheDocument()
  })

  it('retains an existing skill when a disputed phrase matched that same skill', async () => {
    const user = userEvent.setup()
    const capturedBodies: unknown[] = []
    const panelSkill = { id: 8, name: 'Electrical Panel Wiring', subcategory: 'Electrical' }

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(buildWorkerProfileFixture({ skills: [panelSkill] })),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBodies.push(await request.json())

        if (capturedBodies.length === 1) {
          return HttpResponse.json(
            buildWorkerProfileFixture({
              skills: [panelSkill],
              skill_matches: [
                {
                  input_term: 'sarkit wiring',
                  method: 'fuzzy',
                  confidence: 85.5,
                  matched_skill_was_selected: true,
                  matched_skill: panelSkill,
                  suggestions: [],
                },
              ],
            }),
          )
        }

        return HttpResponse.json(
          buildWorkerProfileFixture({ skills: [panelSkill], unmatched_terms: ['sarkit wiring'] }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const input = await screen.findByLabelText('Your skills')
    await user.type(input, 'sarkit wiring')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    const skillsForm = input.closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))
    await user.click(
      await screen.findByRole('button', {
        name: 'Remove this match and send original for review',
      }),
    )
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(capturedBodies[1]).toEqual({
        skill_input: [],
        skill_ids: [8],
        skill_review_input: ['sarkit wiring'],
      })
    })
  })

  it('retains a shared skill when an exact phrase protects a disputed fuzzy match', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null
    const panelSkill = { id: 8, name: 'Electrical Panel Wiring', subcategory: 'Electrical' }

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [panelSkill],
            skill_matches: [
              {
                input_term: 'Electrical Panel Wiring',
                method: 'exact_name',
                confidence: 100,
                matched_skill_was_selected: false,
                matched_skill: panelSkill,
                suggestions: [],
              },
              {
                input_term: 'sarkit wiring',
                method: 'fuzzy',
                confidence: 85.5,
                matched_skill_was_selected: false,
                matched_skill: panelSkill,
                suggestions: [],
              },
            ],
          }),
        ),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [panelSkill],
            unmatched_terms: ['sarkit wiring'],
          }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove this match and send original for review',
      }),
    )
    const skillsForm = screen.getByLabelText('Your skills').closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(capturedBody).toEqual({
        skill_input: [],
        skill_ids: [8],
        skill_review_input: ['sarkit wiring'],
      })
    })
  })

  it('lets the worker choose a standardized skill by category', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(buildWorkerProfileFixture({ skills: [] })),
      ),
      http.get(`${API_ROOT}/taxonomy/tree/`, () => HttpResponse.json(CATEGORY_TREE_FIXTURES)),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
          }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const manualToggle = await screen.findByRole('button', { name: 'Choose a skill manually' })
    expect(manualToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(manualToggle)
    expect(manualToggle).toHaveAttribute('aria-expanded', 'true')
    await user.selectOptions(await screen.findByLabelText('Category'), '1')
    await user.selectOptions(screen.getByLabelText('Subcategory'), '1')
    await user.selectOptions(screen.getByLabelText('Skill'), '2')
    await user.click(screen.getByRole('button', { name: 'Select skill' }))

    expect(
      screen.getByText('House Wiring selected. Save this section to apply the change.'),
    ).toBeInTheDocument()

    const input = screen.getByLabelText('Your skills')
    const skillsForm = input.closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(capturedBody).toEqual({ skill_input: [], skill_ids: [2] })
    })
  })

  it('lets the worker keep an automatic match as an explicit selected skill', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null
    const panelSkill = { id: 8, name: 'Electrical Panel Wiring', subcategory: 'Electrical' }

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [panelSkill],
            skill_matches: [
              {
                input_term: 'sarkit wiring',
                method: 'fuzzy',
                confidence: 85.5,
                matched_skill_was_selected: false,
                matched_skill: panelSkill,
                suggestions: [],
              },
            ],
          }),
        ),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(buildWorkerProfileFixture({ skills: [panelSkill] }))
      }),
    )

    renderWithProviders(<WorkerProfile />)

    const stableDecisionButton = await screen.findByRole('button', {
      name: 'Choose a skill manually',
    })
    const review = await screen.findByRole('region', { name: 'Review match for sarkit wiring' })
    await user.click(within(review).getByRole('button', { name: 'Keep this match' }))

    expect(screen.queryByRole('region', { name: 'Review match for sarkit wiring' }))
      .not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Automatic match kept: Electrical Panel Wiring.',
    )
    expect(stableDecisionButton).toHaveFocus()
    const selectedList = screen.getByRole('list', { name: 'Selected standardized skills' })
    expect(within(selectedList).getByText('Electrical Panel Wiring')).toBeInTheDocument()

    const skillsForm = screen.getByLabelText('Your skills').closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(capturedBody).toEqual({ skill_input: [], skill_ids: [8] })
    })
  })

  it('restores the automatic match when a queued review is cancelled', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null
    const panelSkill = { id: 8, name: 'Electrical Panel Wiring', subcategory: 'Electrical' }

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [panelSkill],
            skill_matches: [
              {
                input_term: 'sarkit wiring',
                method: 'fuzzy',
                confidence: 85.5,
                matched_skill_was_selected: false,
                matched_skill: panelSkill,
                suggestions: [],
              },
            ],
          }),
        ),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(buildWorkerProfileFixture({ skills: [panelSkill] }))
      }),
    )

    renderWithProviders(<WorkerProfile />)

    await user.click(
      await screen.findByRole('button', {
        name: 'Remove this match and send original for review',
      }),
    )
    const queuedReview = screen.getByRole('status', {
      name: 'Skill reviews waiting to be saved',
    })
    await user.click(
      within(queuedReview).getByRole('button', { name: 'Cancel review for sarkit wiring' }),
    )

    expect(screen.queryByRole('status', { name: 'Skill reviews waiting to be saved' }))
      .not.toBeInTheDocument()
    expect(screen.getByText(/review request for “sarkit wiring” cancelled/i)).toBeInTheDocument()

    const skillsForm = screen.getByLabelText('Your skills').closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(capturedBody).toEqual({ skill_input: [], skill_ids: [8] })
    })
  })

  it('preserves an unresolved automatic match while saving another raw phrase', async () => {
    const user = userEvent.setup()
    let capturedBody: unknown = null
    const panelSkill = { id: 8, name: 'Electrical Panel Wiring', subcategory: 'Electrical' }
    const unresolvedMatch = {
      input_term: 'sarkit wiring',
      method: 'fuzzy' as const,
      confidence: 85.5,
      matched_skill_was_selected: false,
      matched_skill: panelSkill,
      suggestions: [],
    }

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () =>
        HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [panelSkill],
            skill_matches: [unresolvedMatch],
          }),
        ),
      ),
      http.patch(`${API_ROOT}/profiles/worker/me/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          buildWorkerProfileFixture({
            skills: [panelSkill],
            skill_matches: [unresolvedMatch],
          }),
        )
      }),
    )

    renderWithProviders(<WorkerProfile />)

    expect(
      await screen.findByRole('region', { name: 'Review match for sarkit wiring' }),
    ).toBeInTheDocument()
    const input = screen.getByLabelText('Your skills')
    await user.type(input, 'tile laying')
    const skillsForm = input.closest('form') as HTMLFormElement
    await user.click(within(skillsForm).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(capturedBody).toEqual({
        skill_input: ['sarkit wiring', 'tile laying'],
        skill_ids: [],
      })
    })
    expect(
      screen.getByRole('region', { name: 'Review match for sarkit wiring' }),
    ).toBeInTheDocument()
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

import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { CATEGORY_FIXTURES, SUBCATEGORY_FIXTURES, buildEmployerJobFixture } from '@/test/fixtures'
import { EmployerJobEdit } from './JobEdit'

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/employer/jobs/:id/edit" element={<EmployerJobEdit />} />
      <Route path="/employer/jobs/:id" element={<p>OWNER JOB DETAIL PAGE</p>} />
    </Routes>,
    { route: `/employer/jobs/${id}/edit` },
  )
}

describe('EmployerJobEdit', () => {
  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(EMPLOYER_USER)
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
  })

  it('loads the existing job and pre-fills the form', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/9/`, () =>
        HttpResponse.json(buildEmployerJobFixture({ id: 9, title: 'Existing Deep Cleaning Job' })),
      ),
    )

    renderAt('9')

    expect(await screen.findByDisplayValue('Existing Deep Cleaning Job')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('shows a retryable error when the job fails to load', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/9/`, () => HttpResponse.json({ detail: 'Server error' }, { status: 500 })),
    )

    renderAt('9')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('redirects to the owner Job Detail page after a successful save', async () => {
    const user = userEvent.setup()
    const job = buildEmployerJobFixture({ id: 9 })

    server.use(
      http.get(`${API_ROOT}/jobs/9/`, () => HttpResponse.json(job)),
      http.patch(`${API_ROOT}/jobs/9/`, () => HttpResponse.json(job)),
    )

    renderAt('9')
    await screen.findByDisplayValue(job.title)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('OWNER JOB DETAIL PAGE')).toBeInTheDocument()
  })

  it('is reachable to edit a job even when the job is CLOSED (editing is not gated on verification or active status)', async () => {
    server.use(
      http.get(`${API_ROOT}/jobs/9/`, () =>
        HttpResponse.json(buildEmployerJobFixture({ id: 9, status: 'CLOSED' })),
      ),
    )

    renderAt('9')

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })
})

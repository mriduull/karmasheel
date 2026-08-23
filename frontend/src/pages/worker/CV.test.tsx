import '@/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildWorkerProfileFixture } from '@/test/fixtures'
import { WorkerCV } from './CV'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

describe('WorkerCV', () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>
  let anchorClickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetAuthStore()
    setAuthenticatedUser(WORKER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/`, () => HttpResponse.json(buildWorkerProfileFixture())),
    )

    createObjectURLSpy = vi.fn(() => 'blob:mock-url')
    revokeObjectURLSpy = vi.fn()
    // jsdom doesn't implement the Blob URL registry or real anchor
    // navigation — stub both so the download flow can be asserted without
    // a jsdom "not implemented" console error.
    URL.createObjectURL = createObjectURLSpy as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURLSpy as unknown as typeof URL.revokeObjectURL
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    anchorClickSpy.mockRestore()
  })

  it('renders the HTML CV preview inside a sandboxed iframe', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/cv/preview/`, () =>
        HttpResponse.text('<html><body><h1>Lead electrician</h1></body></html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )

    renderWithProviders(<WorkerCV />)

    const frame = await screen.findByTitle('CV preview')
    expect(frame.tagName).toBe('IFRAME')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame.getAttribute('srcdoc') ?? '').toContain('Lead electrician')
  })

  it('downloads the PDF as a blob and preserves the server-provided filename', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/cv/preview/`, () =>
        HttpResponse.text('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
      ),
      http.get(`${API_ROOT}/profiles/worker/me/cv/pdf/`, () =>
        new HttpResponse(new Uint8Array([1, 2, 3]).buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="cv-demo_worker_electrician.pdf"',
          },
        }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(<WorkerCV />)

    await screen.findByTitle('CV preview')
    await user.click(screen.getByRole('button', { name: /download pdf/i }))

    await vi.waitFor(() => expect(anchorClickSpy).toHaveBeenCalled())
    expect(createObjectURLSpy).toHaveBeenCalled()
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('uploads a profile photo from the CV page and refreshes the preview', async () => {
    const user = userEvent.setup()
    let previewCallCount = 0
    let capturedBody = ''

    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/cv/preview/`, () => {
        previewCallCount += 1
        return HttpResponse.text(`<html><body><h1>CV ${previewCallCount}</h1></body></html>`, {
          headers: { 'Content-Type': 'text/html' },
        })
      }),
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

    renderWithProviders(<WorkerCV />)

    const input = await screen.findByLabelText('Profile photo')
    await user.upload(input, new File(['image bytes'], 'profile.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: /upload photo/i }))

    await waitFor(() => {
      expect(capturedBody).toContain('name="profile_photo"')
      expect(capturedBody).toContain('Content-Type: image/png')
      expect(previewCallCount).toBeGreaterThan(1)
    })
  })

  it('shows a download-only error without hiding an already-successful preview', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/cv/preview/`, () =>
        HttpResponse.text('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
      ),
      http.get(`${API_ROOT}/profiles/worker/me/cv/pdf/`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(<WorkerCV />)

    await screen.findByTitle('CV preview')
    await user.click(screen.getByRole('button', { name: /download pdf/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByTitle('CV preview')).toBeInTheDocument()
  })

  it('shows a profile-completion prompt on a 404 (no worker profile yet)', async () => {
    server.use(
      http.get(`${API_ROOT}/profiles/worker/me/cv/preview/`, () =>
        HttpResponse.json({ detail: 'Worker profile not found.' }, { status: 404 }),
      ),
    )

    renderWithProviders(<WorkerCV />)

    expect(await screen.findByText('Complete your profile first')).toBeInTheDocument()
  })
})

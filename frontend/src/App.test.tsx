import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import App from './App'
import { resetAuthStore } from '@/test/utils'

describe('App', () => {
  it('boots with no stored session and renders the public landing page', async () => {
    resetAuthStore()
    localStorage.clear()

    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Workforce Match' })).toBeInTheDocument(),
    )
  })

  it('has no automatically-detectable accessibility violations on first render', async () => {
    resetAuthStore()
    localStorage.clear()

    const { container } = render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Workforce Match' })).toBeInTheDocument(),
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

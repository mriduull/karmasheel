import { describe, expect, it } from 'vitest'
import { axe } from 'jest-axe'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchlineHero } from './MatchlineHero'

describe('MatchlineHero', () => {
  it('renders the illustrative worker card, job card, factors, and score', () => {
    render(<MatchlineHero />)

    expect(screen.getByText('Ram Bahadur')).toBeInTheDocument()
    expect(screen.getByText('Electrician Required')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skills/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /distance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /availability/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /experience/i })).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
    expect(screen.getByText(/out of 100 match/i)).toBeInTheDocument()
    expect(screen.getByText(/example match/i)).toBeInTheDocument()
  })

  it('toggles a factor’s explanation on click, and collapses it again on a second click', async () => {
    render(<MatchlineHero />)
    const user = userEvent.setup()

    const distanceButton = screen.getByRole('button', { name: /distance/i })
    expect(distanceButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/1\.8 km/i)).not.toBeInTheDocument()

    await user.click(distanceButton)
    expect(distanceButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/1\.8 km/i)).toBeInTheDocument()

    await user.click(distanceButton)
    expect(distanceButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/1\.8 km/i)).not.toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    const { container } = render(<MatchlineHero />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

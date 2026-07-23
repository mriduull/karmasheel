import '@/i18n'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadingIndicator } from './LoadingIndicator'
import { ErrorBanner } from './ErrorBanner'
import { EmptyState } from './EmptyState'

describe('shared loading/error/empty primitives', () => {
  it('LoadingIndicator exposes an accessible status role and label', () => {
    render(<LoadingIndicator label="Loading jobs" />)
    expect(screen.getByRole('status', { name: 'Loading jobs' })).toBeInTheDocument()
  })

  it('ErrorBanner renders the given (already-translated) message and calls onRetry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(<ErrorBanner message="Something went wrong — please try again." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong — please try again.')

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('ErrorBanner omits the retry button when no onRetry is given', () => {
    render(<ErrorBanner message="Offline." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('EmptyState renders a specific, supportive message rather than a bare placeholder', () => {
    render(
      <EmptyState
        title="No jobs match your filters yet"
        description="Try broadening your search."
      />,
    )
    expect(screen.getByText('No jobs match your filters yet')).toBeInTheDocument()
    expect(screen.getByText('Try broadening your search.')).toBeInTheDocument()
  })
})

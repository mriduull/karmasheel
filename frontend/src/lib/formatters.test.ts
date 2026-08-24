import { describe, expect, it } from 'vitest'
import { formatPostedRelativeTime } from './formatters'

describe('formatPostedRelativeTime', () => {
  const now = new Date('2026-08-24T12:00:00Z')

  it('reports jobs posted earlier today as "today"', () => {
    expect(formatPostedRelativeTime('2026-08-24T06:00:00Z', now)).toBe('Posted today')
  })

  it('uses singular phrasing for exactly one day ago', () => {
    expect(formatPostedRelativeTime('2026-08-23T12:00:00Z', now)).toBe('Posted 1 day ago')
  })

  it('uses plural phrasing for multiple days ago', () => {
    expect(formatPostedRelativeTime('2026-08-19T12:00:00Z', now)).toBe('Posted 5 days ago')
  })
})

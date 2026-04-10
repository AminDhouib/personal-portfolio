import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatDate, formatRelativeDate } from '../date-utils'

describe('formatDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDate('')).toBe('')
  })

  it('formats a valid date string', () => {
    const result = formatDate('2024-01-15T12:00:00')
    expect(result).toMatch(/January 15, 2024/)
  })
})

describe('formatRelativeDate', () => {
  const NOW = new Date('2024-06-01T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string for falsy input', () => {
    expect(formatRelativeDate('')).toBe('')
  })

  it('returns "Today" for same day', () => {
    expect(formatRelativeDate('2024-06-01')).toBe('Today')
  })

  it('returns "Yesterday" for 1 day ago', () => {
    expect(formatRelativeDate('2024-05-31')).toBe('Yesterday')
  })

  it('returns "N days ago" for < 7 days', () => {
    expect(formatRelativeDate('2024-05-28')).toBe('4 days ago')
  })

  it('returns "1 week ago" for < 14 days', () => {
    expect(formatRelativeDate('2024-05-21')).toBe('1 week ago')
  })

  it('returns "N weeks ago" for < 30 days', () => {
    expect(formatRelativeDate('2024-05-08')).toBe('3 weeks ago')
  })

  it('returns "1 month ago" for < 60 days', () => {
    expect(formatRelativeDate('2024-04-15')).toBe('1 month ago')
  })

  it('returns "N months ago" for < 365 days', () => {
    expect(formatRelativeDate('2024-01-01')).toBe('5 months ago')
  })

  it('returns "1 year ago" for < 730 days', () => {
    expect(formatRelativeDate('2023-06-01')).toBe('1 year ago')
  })

  it('returns "N years ago" for >= 730 days', () => {
    expect(formatRelativeDate('2022-01-01')).toBe('2 years ago')
  })
})

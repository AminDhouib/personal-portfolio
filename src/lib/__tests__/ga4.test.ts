import { describe, it, expect } from 'vitest'
import { fetchMAU, fetchAllMAU } from '../ga4'

// GA4_PROPERTY_* env vars are not set in the test environment.
// The propertyIds map is captured at module load time, so all values are undefined.
// fetchMAU hits the `if (!propertyId) return null` guard before any API call.
// No BetaAnalyticsDataClient is ever instantiated — no mocking needed.

describe('fetchMAU', () => {
  it('returns null for an unknown slug', async () => {
    const result = await fetchMAU('not-a-slug')
    expect(result).toBeNull()
  })

  it('returns null when the property env var is not configured', async () => {
    const result = await fetchMAU('shorty')
    expect(result).toBeNull()
  })
})

describe('fetchAllMAU', () => {
  it('returns an object with all expected slug keys', async () => {
    const result = await fetchAllMAU()
    expect(Object.keys(result).sort()).toEqual(
      ['caramel', 'getitdone', 'shorty', 'unotes', 'upup']
    )
  })

  it('returns null for all slugs when env vars are not configured', async () => {
    const result = await fetchAllMAU()
    for (const value of Object.values(result)) {
      expect(value).toBeNull()
    }
  })
})

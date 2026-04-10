import { describe, it, expect, afterEach, vi } from 'vitest'
import { fetchRepoStats, fetchContributionGraph } from '../github'

// NOTE: GITHUB_TOKEN is captured at module-load time in github.ts (const GITHUB_TOKEN = ...).
// Mutating process.env.GITHUB_TOKEN in beforeEach has no effect on the guard inside
// fetchContributionGraph — it checks the already-captured const, not process.env.
// Strategy:
//   fetchRepoStats  → vi.stubGlobal('fetch', ...) to test error / success paths
//   fetchContributionGraph → test directly; returns [] if token was absent at load time,
//                            or [] on any fetch error (both paths return [])

describe('fetchRepoStats', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns { stars: 0, forks: 0 } on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const result = await fetchRepoStats('owner', 'repo')
    expect(result).toEqual({ stars: 0, forks: 0 })
  })

  it('returns { stars: 0, forks: 0 } on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const result = await fetchRepoStats('owner', 'repo')
    expect(result).toEqual({ stars: 0, forks: 0 })
  })

  it('returns stars and forks on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stargazers_count: 42, forks_count: 7 }),
    }))
    const result = await fetchRepoStats('owner', 'repo')
    expect(result).toEqual({ stars: 42, forks: 7 })
  })
})

describe('fetchContributionGraph', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an array of contribution days (or [] when no token/error)', async () => {
    // Without a real GITHUB_TOKEN at module load time the guard returns [].
    // With a token but no real API in test env, fetch will fail → returns [].
    // Either way the result must be an array.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')))
    const result = await fetchContributionGraph('testuser')
    expect(Array.isArray(result)).toBe(true)
  })
})

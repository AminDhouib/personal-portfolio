import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { logWarn, logError } from '../log'

const mockCaptureException = vi.hoisted(() => vi.fn())
const mockPostHogCtor = vi.hoisted(() => vi.fn())

vi.mock('posthog-node', () => ({
  PostHog: class MockPostHog {
    constructor(...args: unknown[]) {
      mockPostHogCtor(...args)
    }
    captureException = mockCaptureException
  },
}))

describe('logWarn / logError', () => {
  it('logWarn writes a single console.warn line including scope and message', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logWarn('github', 'fetchRepoStats failed')
    expect(spy).toHaveBeenCalledOnce()
    const [line] = spy.mock.calls[0]
    expect(line).toContain('[github]')
    expect(line).toContain('fetchRepoStats failed')
    spy.mockRestore()
  })

  it('logWarn renders an Error detail as message + first stack line, not a raw dump', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = new Error('boom')
    logWarn('ga4', 'runReport failed', err)
    expect(spy).toHaveBeenCalledOnce()
    const [line] = spy.mock.calls[0] as [string]
    expect(typeof line).toBe('string')
    expect(line).toContain('boom')
    // Single line: no embedded newlines from a full stack dump.
    expect(line.includes('\n')).toBe(false)
    spy.mockRestore()
  })

  it('logError writes a single console.error line including scope and message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('leaderboard', 'read failed', new Error('disk full'))
    expect(spy).toHaveBeenCalledOnce()
    const [line] = spy.mock.calls[0] as [string]
    expect(line).toContain('[leaderboard]')
    expect(line).toContain('read failed')
    expect(line).toContain('disk full')
    spy.mockRestore()
  })

  it('omits the detail suffix entirely when no detail is passed', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logWarn('scope', 'just a message')
    const [line] = spy.mock.calls[0] as [string]
    expect(line).toBe('[scope] just a message')
    spy.mockRestore()
  })
})

// captureException reloads the module fresh (vi.resetModules + dynamic import)
// in every test. The module memoizes its PostHog client as a module-level
// singleton, so reusing one static import across these tests would let an
// earlier test's env config (or constructed client) leak into a later test.
describe('captureException', () => {
  let savedKey: string | undefined
  let savedHost: string | undefined

  beforeEach(() => {
    savedKey = process.env.POSTHOG_KEY
    savedHost = process.env.POSTHOG_HOST
    delete process.env.POSTHOG_KEY
    delete process.env.POSTHOG_HOST
    mockCaptureException.mockReset()
    mockPostHogCtor.mockReset()
  })

  afterEach(() => {
    if (savedKey === undefined) delete process.env.POSTHOG_KEY
    else process.env.POSTHOG_KEY = savedKey
    if (savedHost === undefined) delete process.env.POSTHOG_HOST
    else process.env.POSTHOG_HOST = savedHost
  })

  it('is a no-op (no client constructed, no network) when env is not configured', async () => {
    vi.resetModules()
    const { captureException } = await import('../log')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => captureException('leads.persist', new Error('disk full'))).not.toThrow()
    expect(mockPostHogCtor).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
    // Still logs locally even when PostHog isn't configured.
    expect(errorSpy).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })

  it('stays a no-op when only one of POSTHOG_KEY/POSTHOG_HOST is set', async () => {
    process.env.POSTHOG_KEY = 'phc_test'
    vi.resetModules()
    const { captureException } = await import('../log')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => captureException('leads.email', new Error('resend down'))).not.toThrow()
    expect(mockPostHogCtor).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('sends an exception event tagged with scope when both env vars are set', async () => {
    process.env.POSTHOG_KEY = 'phc_test'
    process.env.POSTHOG_HOST = 'https://posthog.example.com'
    vi.resetModules()
    const { captureException } = await import('../log')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const err = new Error('read failed')
    captureException('leaderboard', err)

    expect(mockPostHogCtor).toHaveBeenCalledOnce()
    expect(mockPostHogCtor).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ host: 'https://posthog.example.com', flushAt: 1, flushInterval: 0 })
    )
    expect(mockCaptureException).toHaveBeenCalledOnce()
    const [capturedError, distinctId, properties] = mockCaptureException.mock.calls[0]
    expect(capturedError).toBe(err)
    expect(distinctId).toBe('server')
    expect(properties).toMatchObject({ scope: 'leaderboard' })
    errorSpy.mockRestore()
  })

  it('never throws even if the underlying PostHog capture call throws', async () => {
    process.env.POSTHOG_KEY = 'phc_test'
    process.env.POSTHOG_HOST = 'https://posthog.example.com'
    mockCaptureException.mockImplementation(() => {
      throw new Error('network unreachable')
    })
    vi.resetModules()
    const { captureException } = await import('../log')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => captureException('leaderboard', new Error('read failed'))).not.toThrow()
    expect(mockCaptureException).toHaveBeenCalledOnce()
    errorSpy.mockRestore()
  })
})

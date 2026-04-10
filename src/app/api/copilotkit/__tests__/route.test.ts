import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockHandleRequest = vi.hoisted(() => vi.fn())

vi.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: class MockCopilotRuntime {},
  OpenAIAdapter: class MockOpenAIAdapter {},
  copilotRuntimeNextJSAppRouterEndpoint: vi.fn(() => ({
    handleRequest: mockHandleRequest,
  })),
}))

import { POST } from '../route'

describe('POST /api/copilotkit', () => {
  let savedKey: string | undefined

  beforeEach(() => {
    savedKey = process.env.OPENROUTER_KEY
    delete process.env.OPENROUTER_KEY
    mockHandleRequest.mockReset()
  })

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.OPENROUTER_KEY = savedKey
    } else {
      delete process.env.OPENROUTER_KEY
    }
  })

  it('returns 503 when OPENROUTER_KEY is not set', async () => {
    const req = new NextRequest('http://localhost/api/copilotkit', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const response = await POST(req)
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({ error: 'OPENROUTER_KEY not configured' })
  })

  it('returns Content-Type application/json on 503 response', async () => {
    const req = new NextRequest('http://localhost/api/copilotkit', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const response = await POST(req)
    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('delegates to handleRequest when OPENROUTER_KEY is set', async () => {
    process.env.OPENROUTER_KEY = 'test-key-abc'
    const mockResponse = new Response('ok', { status: 200 })
    mockHandleRequest.mockResolvedValueOnce(mockResponse)

    const req = new NextRequest('http://localhost/api/copilotkit', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
    })
    const response = await POST(req)

    expect(mockHandleRequest).toHaveBeenCalledOnce()
    expect(mockHandleRequest).toHaveBeenCalledWith(req)
    expect(response).toBe(mockResponse)
  })

  it('does not call handleRequest when OPENROUTER_KEY is missing', async () => {
    const req = new NextRequest('http://localhost/api/copilotkit', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    await POST(req)
    expect(mockHandleRequest).not.toHaveBeenCalled()
  })
})

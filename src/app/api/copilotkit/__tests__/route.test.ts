import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'

describe('POST /api/copilotkit', () => {
  let savedKey: string | undefined

  beforeEach(() => {
    savedKey = process.env.OPENROUTER_KEY
    delete process.env.OPENROUTER_KEY
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
})

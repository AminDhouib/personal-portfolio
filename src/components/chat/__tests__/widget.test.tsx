import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Mock bare CSS import — vitest has no CSS transform
vi.mock('@copilotkit/react-ui/styles.css', () => ({}))

// Capture useCopilotAction arg so we can unit-test the handler directly
let capturedAction: Record<string, unknown> | null = null

vi.mock('@copilotkit/react-core', () => ({
  CopilotKit: ({ children, runtimeUrl }: { children: React.ReactNode; runtimeUrl: string }) => (
    <div data-testid="copilotkit" data-runtime-url={runtimeUrl}>
      {children}
    </div>
  ),
  useCopilotAction: vi.fn((action: Record<string, unknown>) => {
    capturedAction = action
  }),
}))

vi.mock('@copilotkit/react-ui', () => ({
  CopilotPopup: ({
    labels,
    defaultOpen,
  }: {
    labels: { title: string; initial: string; placeholder: string }
    defaultOpen: boolean
  }) => (
    <div data-testid="copilot-popup" data-default-open={String(defaultOpen)}>
      <span data-testid="popup-title">{labels.title}</span>
      <span data-testid="popup-initial">{labels.initial}</span>
      <span data-testid="popup-placeholder">{labels.placeholder}</span>
    </div>
  ),
}))

import { ChatWidget } from '../widget'

describe('ChatWidget', () => {
  beforeEach(() => {
    capturedAction = null
  })

  // --- Visibility ---

  it('renders nothing when enabled is undefined', () => {
    const { container } = render(<ChatWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when enabled={false}', () => {
    const { container } = render(<ChatWidget enabled={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders CopilotKit when enabled={true}', () => {
    render(<ChatWidget enabled />)
    expect(screen.getByTestId('copilotkit')).toBeDefined()
  })

  // --- CopilotKit provider ---

  it('passes runtimeUrl="/api/copilotkit" to CopilotKit', () => {
    render(<ChatWidget enabled />)
    expect(screen.getByTestId('copilotkit').getAttribute('data-runtime-url')).toBe(
      '/api/copilotkit',
    )
  })

  // --- CopilotPopup labels ---

  it('renders CopilotPopup with title "Ask Amin\'s AI"', () => {
    render(<ChatWidget enabled />)
    expect(screen.getByTestId('popup-title').textContent).toBe("Ask Amin's AI")
  })

  it('renders CopilotPopup with correct placeholder', () => {
    render(<ChatWidget enabled />)
    expect(screen.getByTestId('popup-placeholder').textContent).toBe(
      "Ask about Amin's projects, skills...",
    )
  })

  it('renders CopilotPopup with correct initial greeting', () => {
    render(<ChatWidget enabled />)
    const initial = screen.getByTestId('popup-initial').textContent ?? ''
    expect(initial).toMatch(/Hi!/)
    expect(initial).toMatch(/Ask me anything/)
  })

  it('renders CopilotPopup with defaultOpen=false', () => {
    render(<ChatWidget enabled />)
    expect(screen.getByTestId('copilot-popup').getAttribute('data-default-open')).toBe('false')
  })

  // --- collectLead action registration ---

  it('registers a useCopilotAction with name "collectLead"', () => {
    render(<ChatWidget enabled />)
    expect(capturedAction).not.toBeNull()
    expect(capturedAction!.name).toBe('collectLead')
  })

  it('collectLead has required "name" and "email" parameters', () => {
    render(<ChatWidget enabled />)
    const params = capturedAction!.parameters as Array<{ name: string; required?: boolean }>
    const nameParam = params.find((p) => p.name === 'name')
    const emailParam = params.find((p) => p.name === 'email')
    expect(nameParam?.required).toBe(true)
    expect(emailParam?.required).toBe(true)
  })

  it('collectLead has optional "note" parameter', () => {
    render(<ChatWidget enabled />)
    const params = capturedAction!.parameters as Array<{ name: string; required?: boolean }>
    const noteParam = params.find((p) => p.name === 'note')
    expect(noteParam).toBeDefined()
    expect(noteParam?.required).toBeFalsy()
  })

  // --- collectLead handler ---

  it('handler POSTs to /api/leads with correct payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    )
    render(<ChatWidget enabled />)
    const handler = capturedAction!.handler as (args: {
      name: string
      email: string
      note?: string
    }) => Promise<string>

    await handler({ name: 'Alice', email: 'alice@example.com', note: 'Hello' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/leads')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({
      name: 'Alice',
      email: 'alice@example.com',
      note: 'Hello',
      source: 'chatbot',
    })
    fetchSpy.mockRestore()
  })

  it('handler returns success string when response is ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }))
    render(<ChatWidget enabled />)
    const handler = capturedAction!.handler as (args: {
      name: string
      email: string
      note?: string
    }) => Promise<string>

    const result = await handler({ name: 'Bob', email: 'bob@example.com' })
    expect(result).toBe('Lead saved for Bob (bob@example.com). Amin will be in touch soon!')
    vi.restoreAllMocks()
  })

  it('handler returns fallback string when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 500 }))
    render(<ChatWidget enabled />)
    const handler = capturedAction!.handler as (args: {
      name: string
      email: string
      note?: string
    }) => Promise<string>

    const result = await handler({ name: 'Eve', email: 'eve@evil.com' })
    expect(result).toMatch(/Sorry/)
    expect(result).toMatch(/amin@devino\.ca/)
    vi.restoreAllMocks()
  })

  it('handler returns fallback string when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))
    render(<ChatWidget enabled />)
    const handler = capturedAction!.handler as (args: {
      name: string
      email: string
      note?: string
    }) => Promise<string>

    const result = await handler({ name: 'Eve', email: 'eve@evil.com' })
    expect(result).toMatch(/Sorry/)
    vi.restoreAllMocks()
  })
})

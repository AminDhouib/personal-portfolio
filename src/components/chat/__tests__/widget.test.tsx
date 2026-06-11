import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => '/'),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicChatPanel({
      pathname,
      initiallyOpen,
      openSignal,
    }: {
      pathname: string
      initiallyOpen?: boolean
      openSignal?: number
    }) {
      return (
        <div
          data-testid="lazy-panel"
          data-pathname={pathname}
          data-initially-open={String(Boolean(initiallyOpen))}
          data-open-signal={String(openSignal)}
        />
      )
    },
}))

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
  useCopilotReadable: vi.fn(),
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
  useCopilotChatSuggestions: vi.fn(),
}))

import { ChatWidget } from '../widget'
import { ChatWidgetPanel } from '../widget-panel'

describe('ChatWidget shell', () => {
  beforeEach(() => {
    capturedAction = null
    mockUsePathname.mockReturnValue('/')
    vi.clearAllMocks()
  })

  it('renders nothing when enabled is undefined', () => {
    const { container } = render(<ChatWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when enabled={false}', () => {
    const { container } = render(<ChatWidget enabled={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a lightweight launcher instead of CopilotKit before opening', () => {
    render(<ChatWidget enabled />)
    expect(screen.getByRole('button', { name: /open amin ai chat/i })).toBeDefined()
    expect(screen.queryByTestId('copilotkit')).toBeNull()
    expect(screen.queryByTestId('lazy-panel')).toBeNull()
  })

  it('does not render on game routes', () => {
    mockUsePathname.mockReturnValue('/games/space-shooter')
    const { container } = render(<ChatWidget enabled />)
    expect(container.firstChild).toBeNull()
  })

  it('loads the panel when the launcher is clicked', () => {
    render(<ChatWidget enabled />)
    fireEvent.click(screen.getByRole('button', { name: /open amin ai chat/i }))
    expect(screen.getByTestId('lazy-panel').getAttribute('data-pathname')).toBe('/')
    expect(screen.getByTestId('lazy-panel').getAttribute('data-initially-open')).toBe('true')
  })

  it('loads the panel when the navbar event is dispatched', async () => {
    render(<ChatWidget enabled />)
    window.dispatchEvent(new CustomEvent('open-amin-ai-chat'))

    await waitFor(() => {
      expect(screen.getByTestId('lazy-panel').getAttribute('data-open-signal')).toBe('1')
    })
  })
})

describe('ChatWidgetPanel', () => {
  beforeEach(() => {
    capturedAction = null
    vi.clearAllMocks()
  })

  // --- CopilotKit provider ---

  it('passes runtimeUrl="/api/copilotkit" to CopilotKit', () => {
    render(<ChatWidgetPanel pathname="/" />)
    expect(screen.getByTestId('copilotkit').getAttribute('data-runtime-url')).toBe(
      '/api/copilotkit',
    )
  })

  // --- CopilotPopup labels ---

  it('renders CopilotPopup with title "Amin AI"', () => {
    render(<ChatWidgetPanel pathname="/" />)
    expect(screen.getByTestId('popup-title').textContent).toBe('Amin AI')
  })

  it('renders CopilotPopup with correct placeholder', () => {
    render(<ChatWidgetPanel pathname="/" />)
    expect(screen.getByTestId('popup-placeholder').textContent).toBe(
      "Ask about Amin's projects, skills...",
    )
  })

  it('renders CopilotPopup with correct initial greeting', () => {
    render(<ChatWidgetPanel pathname="/" />)
    const initial = screen.getByTestId('popup-initial').textContent ?? ''
    expect(initial).toMatch(/Hi!/)
    expect(initial).toMatch(/Ask me anything/)
  })

  it('passes initiallyOpen through to CopilotPopup defaultOpen', () => {
    render(<ChatWidgetPanel pathname="/" initiallyOpen />)
    expect(screen.getByTestId('copilot-popup').getAttribute('data-default-open')).toBe('true')
  })

  // --- collectLead action registration ---

  it('registers a useCopilotAction with name "collectLead"', () => {
    render(<ChatWidgetPanel pathname="/" />)
    expect(capturedAction).not.toBeNull()
    expect(capturedAction!.name).toBe('collectLead')
  })

  it('collectLead has required "name" and "email" parameters', () => {
    render(<ChatWidgetPanel pathname="/" />)
    const params = capturedAction!.parameters as Array<{ name: string; required?: boolean }>
    const nameParam = params.find((p) => p.name === 'name')
    const emailParam = params.find((p) => p.name === 'email')
    expect(nameParam?.required).toBe(true)
    expect(emailParam?.required).toBe(true)
  })

  it('collectLead has optional "note" parameter', () => {
    render(<ChatWidgetPanel pathname="/" />)
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
    render(<ChatWidgetPanel pathname="/" />)
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
    render(<ChatWidgetPanel pathname="/" />)
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
    render(<ChatWidgetPanel pathname="/" />)
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
    render(<ChatWidgetPanel pathname="/" />)
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

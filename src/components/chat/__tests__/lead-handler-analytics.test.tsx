import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";

const { posthogMock } = vi.hoisted(() => ({
  posthogMock: { __loaded: true, capture: vi.fn(), identify: vi.fn() },
}));
vi.mock("posthog-js", () => ({ default: posthogMock }));

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@copilotkit/react-ui/styles.css", () => ({}));

let capturedAction: Record<string, unknown> | null = null;
vi.mock("@copilotkit/react-core", () => ({
  CopilotKit: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useCopilotAction: vi.fn((action: Record<string, unknown>) => {
    capturedAction = action;
  }),
  useCopilotReadable: vi.fn(),
}));
vi.mock("@copilotkit/react-ui", () => ({
  CopilotPopup: () => null,
  useCopilotChatSuggestions: vi.fn(),
}));

import { ChatWidgetPanel } from "../widget-panel";

type Handler = (args: { name: string; email: string; note?: string }) => Promise<string>;

// The real trackLeadSubmitted runs here (only posthog-js is faked): an analytics failure after
// a saved lead must not change what the visitor is told.
describe("collectLead handler when analytics fails", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    posthogMock.identify.mockReset();
    posthogMock.capture.mockReset();
  });

  it("still replies that the lead was saved when PostHog throws", async () => {
    posthogMock.identify.mockImplementation(() => {
      throw new Error("posthog down");
    });
    posthogMock.capture.mockImplementation(() => {
      throw new Error("posthog down");
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 200 }));
    render(<ChatWidgetPanel pathname="/" />);

    const reply = await (capturedAction!.handler as Handler)({
      name: "Bob",
      email: "bob@example.com",
    });

    expect(posthogMock.identify).toHaveBeenCalled();
    expect(reply).toBe("Lead saved for Bob (bob@example.com). Amin will be in touch soon!");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@copilotkit/react-ui/styles.css", () => ({}));
vi.mock("@/hooks/use-lead-collector-action", () => ({ useLeadCollectorAction: vi.fn() }));
vi.mock("@copilotkit/react-core", () => ({
  CopilotKit: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useCopilotReadable: vi.fn(),
}));
vi.mock("@copilotkit/react-ui", () => ({
  CopilotChat: () => <div data-testid="transcript">chat</div>,
  CopilotPopup: () => <div data-testid="transcript">popup</div>,
  useCopilotChatSuggestions: vi.fn(),
}));

import { AiPageChat } from "../ai-page-chat";
import { ChatWidgetPanel } from "../widget-panel";

// Session recorders (PostHog, Sentry) mask the text of any element under a `.ph-sensitive`
// ancestor (instrumentation-client.ts), so the class on the chat surface hides every message
// bubble, including a lead's name, email and note. /privacy says chat messages are hidden.
describe("chat surfaces are masked in session recordings", () => {
  it("wraps the chatbot widget panel's transcript in .ph-sensitive", () => {
    render(<ChatWidgetPanel pathname="/" />);
    expect(screen.getByTestId("transcript").closest(".ph-sensitive")).not.toBeNull();
  });

  it("wraps the /ai page chat transcript in .ph-sensitive", () => {
    render(<AiPageChat />);
    expect(screen.getByTestId("transcript").closest(".ph-sensitive")).not.toBeNull();
  });
});

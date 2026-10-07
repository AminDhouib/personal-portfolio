import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@copilotkit/react-ui/styles.css", () => ({}));
vi.mock("@/hooks/use-lead-collector-action", () => ({ useLeadCollectorAction: vi.fn() }));
vi.mock("@copilotkit/react-core", () => ({
  CopilotKit: ({
    children,
    useSingleEndpoint,
  }: {
    children: React.ReactNode;
    useSingleEndpoint?: boolean;
  }) => (
    <div data-testid="copilotkit" data-single-endpoint={String(useSingleEndpoint)}>
      {children}
    </div>
  ),
  useCopilotReadable: vi.fn(),
}));
vi.mock("@copilotkit/react-ui", () => ({
  CopilotChat: () => null,
  CopilotPopup: () => null,
  useCopilotChatSuggestions: vi.fn(),
}));

import { AiPageChat } from "../ai-page-chat";
import { ChatWidgetPanel } from "../widget-panel";

// The route only exports POST. CopilotKit 1.54 defaulted to the single-route
// transport; 1.77 defaults to "auto", which first sends GET /info (a 405 here
// that also skips guardRequest). Both mounts must keep asking for it explicitly.
describe("CopilotKit transport", () => {
  it("the /ai page mount uses the single-route transport", () => {
    render(<AiPageChat />);
    expect(screen.getByTestId("copilotkit").getAttribute("data-single-endpoint")).toBe("true");
  });

  it("the floating widget mount uses the single-route transport", () => {
    render(<ChatWidgetPanel pathname="/" />);
    expect(screen.getByTestId("copilotkit").getAttribute("data-single-endpoint")).toBe("true");
  });
});

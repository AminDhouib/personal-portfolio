import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const popupProps = vi.hoisted(() => vi.fn());
const chatProps = vi.hoisted(() => vi.fn());
const dynamicSuggestions = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@copilotkit/react-ui/styles.css", () => ({}));
vi.mock("@/hooks/use-lead-collector-action", () => ({ useLeadCollectorAction: vi.fn() }));
vi.mock("@copilotkit/react-core", () => ({
  CopilotKit: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useCopilotReadable: vi.fn(),
}));
vi.mock("@copilotkit/react-ui", () => ({
  CopilotChat: (props: unknown) => {
    chatProps(props);
    return null;
  },
  CopilotPopup: (props: unknown) => {
    popupProps(props);
    return null;
  },
  useCopilotChatSuggestions: dynamicSuggestions,
}));

import { AiPageChat } from "../ai-page-chat";
import { ChatWidgetPanel } from "../widget-panel";

const TITLES = [
  "What has Amin built?",
  "Is Amin available for hire?",
  "How do I book a call with Amin?",
];

// CopilotKit 1.77's dynamic suggestions (useCopilotChatSuggestions) loop on the client: the chips
// mount, each runs agent/connect, the result reloads the suggestions and remounts the chips, and a
// new LLM run starts (about 9 agent/run calls per open, then 429s). A static array on the chat
// component short-circuits all of it, so neither mount may call the hook.
describe("static chat suggestions", () => {
  beforeEach(() => {
    popupProps.mockClear();
    chatProps.mockClear();
    dynamicSuggestions.mockClear();
  });

  it("the floating widget passes exactly the three static chips and never the dynamic hook", () => {
    render(<ChatWidgetPanel pathname="/" />);
    const props = popupProps.mock.calls[0]?.[0] as { suggestions?: unknown };
    expect(props.suggestions).toEqual(TITLES.map((title) => ({ title, message: title })));
    expect(dynamicSuggestions).not.toHaveBeenCalled();
  });

  it("the /ai page passes exactly the three static chips and never the dynamic hook", () => {
    render(<AiPageChat />);
    const props = chatProps.mock.calls[0]?.[0] as { suggestions?: unknown };
    expect(props.suggestions).toEqual(TITLES.map((title) => ({ title, message: title })));
    expect(dynamicSuggestions).not.toHaveBeenCalled();
  });
});

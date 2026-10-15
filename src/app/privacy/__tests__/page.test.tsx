import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "../page";

function pageText(): string {
  const { container } = render(<PrivacyPage />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("/privacy", () => {
  it("has one h1, a canonical URL and a description", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(metadata.title).toBe("Privacy");
    expect(metadata.alternates?.canonical).toBe("https://amindhou.com/privacy");
    expect(metadata.description).toEqual(expect.any(String));
  });

  it("states that lead details are linked to the visit in the self-hosted analytics", () => {
    // The owner's condition for identifying leads in PostHog (2026-10-15). If the code stops
    // doing this, or this sentence changes, update src/lib/lead-analytics.ts and this page
    // together.
    expect(pageText()).toContain(
      "When you give your name and email through the chat to be contacted, they are saved so Amin can reply, and they are linked to your visit in our own (self-hosted) analytics, including how you arrived: campaign source, medium, referrer and landing page.",
    );
  });

  it("says the note and the GA4 boundary the code keeps", () => {
    const text = pageText();
    expect(text).toContain("The note you write is not sent to analytics.");
    expect(text).toContain("Google Analytics never receives your name or email.");
  });

  it("names every data category the site handles", () => {
    render(<PrivacyPage />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(
      expect.arrayContaining([
        "Analytics",
        "Session recordings and error monitoring",
        "Google Analytics",
        "The AI chat",
        "Your contact details",
        "Games and leaderboards",
        "Questions and deletion",
      ]),
    );
  });

  it("covers the tools by name", () => {
    const text = pageText();
    for (const name of ["PostHog", "Sentry", "OpenRouter", "posthog.devino.ca"]) {
      expect(text).toContain(name);
    }
  });

  it("gives the address for questions and deletion requests", () => {
    render(<PrivacyPage />);
    const link = screen.getByRole("link", { name: "amin@devino.ca" });
    expect(link).toHaveAttribute("href", "mailto:amin@devino.ca");
  });

  it("is plain ASCII, with no emoji or smart punctuation", () => {
    expect(pageText()).toMatch(/^[\x20-\x7e]*$/);
  });
});

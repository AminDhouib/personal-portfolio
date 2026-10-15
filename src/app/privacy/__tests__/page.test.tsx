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

  it("states that the lead's email becomes the analytics ID and ties the visit to it", () => {
    // The owner's condition for identifying leads in PostHog (2026-10-15). If the code stops
    // doing this, or this sentence changes, update src/lib/lead-analytics.ts and this page
    // together.
    expect(pageText()).toContain(
      "When you give your name and email through the chat to be contacted, they are saved so Amin can reply. Your email also becomes the analytics ID for this browser, so your earlier and later activity on this site from the same browser (page views, clicks and recordings) is tied to it in our own (self-hosted) PostHog, along with how you arrived (campaign source, medium, campaign, referrer and landing page) and which chat you used.",
    );
  });

  it("says what stays out of analytics and recordings", () => {
    const text = pageText();
    expect(text).toContain(
      "The note you write is not sent to analytics, and chat messages are hidden in recordings.",
    );
    expect(text).toContain("Google Analytics never receives your name or email.");
    expect(text).toContain("Messages in the AI chat are hidden in recordings.");
    expect(text).toContain("Other text on the page is not hidden");
  });

  it("names the storage and IP facts", () => {
    const text = pageText();
    expect(text).toContain("in a cookie and in your browser's local storage");
    expect(text).toContain("sets its own cookies");
    expect(text).toContain("receive your IP address with each request");
    expect(text).toContain("breadcrumbs");
    expect(text).toContain("1 in 10 page loads");
    expect(text).toContain("UseSend");
  });

  it("states retention honestly, without inventing periods", () => {
    const text = pageText();
    expect(text).toContain("kept until you ask us to delete them");
    expect(text).toContain("delete your data from PostHog and Sentry");
    expect(text).not.toMatch(/d+ (days|months|years)/);
  });

  it("does not hedge about Google Analytics being on", () => {
    const text = pageText();
    expect(text).not.toContain("When it is switched on");
    expect(text).not.toContain("can load");
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

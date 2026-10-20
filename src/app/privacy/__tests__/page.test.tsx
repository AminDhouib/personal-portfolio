import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPage, { metadata } from "../page";
import { profile } from "@/data/profile";

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
      "When you give your name and email through the chat to be contacted, they are saved so Amin can reply. Your email also becomes the analytics ID for this browser, so your earlier and later activity on this site from the same browser (page views, clicks and recordings) is tied to it in our own (self-hosted) PostHog, along with how you arrived (campaign tags: source, medium and campaign name; referrer; landing page) and which chat you used.",
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
    expect(text).toContain("1 in 10 page loads and navigations");
    expect(text).toContain("also go to our PostHog, without any visitor ID");
    expect(text).toContain("Google also receives your IP address");
    expect(text).toContain("adds only how you arrived and which chat you used");
    expect(text).toContain("Sendly");
  });

  it("states retention honestly, without inventing periods", () => {
    const text = pageText();
    expect(text).toContain("kept until you ask us to delete them");
    expect(text).toContain(
      "we delete your saved contact details (including the notification email copy), your PostHog profile and its recordings, and, if you tell us your player ID, your arcade scores.",
    );
    expect(text).toContain("Sentry data is not tied to a person");
    expect(text).toContain("Sentry, also hosted by us, records about 1 in 10 visits");
    const period = /\d+ (days|months|years)/;
    // The pattern has to be able to match, or the next line proves nothing.
    expect("kept for 30 days").toMatch(period);
    expect(text).not.toMatch(period);
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

  it("says analytics requests go through this site's own address on their way to PostHog", () => {
    const text = pageText();
    expect(text).toContain(
      "Your browser sends these analytics requests to this site's own address (amindhou.com), and this site's server passes them on to our PostHog together with your IP address.",
    );
    // The host is still named, as the instance that receives them.
    expect(text).toContain("which we host ourselves at posthog.devino.ca");
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
    expect(link).toHaveAttribute("href", "mailto:amin@devino.ca?subject=Privacy%20request");
    expect(link.textContent).toBe(profile.email);
    expect(pageText()).toContain('with the subject "Privacy request".');
  });

  it("is plain ASCII, with no emoji or smart punctuation", () => {
    expect(pageText()).toMatch(/^[\x20-\x7e]*$/);
  });
});

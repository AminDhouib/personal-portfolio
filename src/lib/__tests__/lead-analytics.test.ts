import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { posthogMock } = vi.hoisted(() => ({
  posthogMock: { __loaded: false, capture: vi.fn(), identify: vi.fn() },
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

import { trackLeadSubmitted } from "../lead-analytics";
import { recordVisitAttribution, resetVisitAttributionForTests } from "../visit-attribution";

const LEAD = { name: "  Ada Lovelace ", email: "  Ada@Example.COM ", surface: "ai-page" };

describe("trackLeadSubmitted", () => {
  let gtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    posthogMock.__loaded = true;
    posthogMock.capture.mockReset();
    posthogMock.identify.mockReset();
    gtag = vi.fn();
    Object.assign(window, { gtag });
    resetVisitAttributionForTests();
    window.sessionStorage.clear();
    window.history.pushState({}, "", "/work?utm_source=li&utm_medium=social&utm_campaign=q4");
    vi.spyOn(document, "referrer", "get").mockReturnValue("https://www.linkedin.com/feed/?x=1");
    recordVisitAttribution();
    window.history.pushState({}, "", "/ai");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "gtag");
    window.history.pushState({}, "", "/");
  });

  it("captures lead_submitted with the visit's first-touch attribution and the surface", () => {
    trackLeadSubmitted(LEAD);
    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
    expect(posthogMock.capture).toHaveBeenCalledWith("lead_submitted", {
      source: "li",
      medium: "social",
      campaign: "q4",
      referrer: "https://www.linkedin.com/feed/",
      referring_domain: "www.linkedin.com",
      landing_page: "/work",
      lead_surface: "ai-page",
    });
  });

  it("identifies the person by the normalized email, with name and email as properties", () => {
    trackLeadSubmitted(LEAD);
    expect(posthogMock.identify).toHaveBeenCalledTimes(1);
    expect(posthogMock.identify).toHaveBeenCalledWith("ada@example.com", {
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
  });

  it("identifies before it captures, so the event belongs to the person", () => {
    trackLeadSubmitted(LEAD);
    const identifyOrder = posthogMock.identify.mock.invocationCallOrder[0] ?? 0;
    const captureOrder = posthogMock.capture.mock.invocationCallOrder[0] ?? 0;
    expect(identifyOrder).toBeLessThan(captureOrder);
  });

  it("omits attribution fields that are empty instead of sending blanks", () => {
    resetVisitAttributionForTests();
    window.sessionStorage.clear();
    vi.spyOn(document, "referrer", "get").mockReturnValue("");
    window.history.pushState({}, "", "/blog");
    recordVisitAttribution();
    trackLeadSubmitted(LEAD);
    expect(posthogMock.capture).toHaveBeenCalledWith("lead_submitted", {
      landing_page: "/blog",
      lead_surface: "ai-page",
    });
  });

  it("sends GA4 the event with attribution only: no email, no name", () => {
    trackLeadSubmitted(LEAD);
    expect(gtag).toHaveBeenCalledTimes(1);
    const [verb, event, props] = gtag.mock.calls[0] as [string, string, Record<string, string>];
    expect(verb).toBe("event");
    expect(event).toBe("lead_submitted");
    expect(props).toMatchObject({ source: "li", lead_surface: "ai-page" });
    const serialized = JSON.stringify(gtag.mock.calls);
    expect(serialized).not.toMatch(/ada@example\.com/i);
    expect(serialized).not.toMatch(/lovelace/i);
  });

  it("never puts the email or name in the PostHog event properties", () => {
    trackLeadSubmitted(LEAD);
    const serialized = JSON.stringify(posthogMock.capture.mock.calls);
    expect(serialized).not.toMatch(/ada@example\.com/i);
    expect(serialized).not.toMatch(/lovelace/i);
  });

  it("takes no free-text note: the signature has no way to carry one", () => {
    // The note is the visitor's own words; it stays in /api/leads and never reaches analytics.
    trackLeadSubmitted({ ...LEAD, note: "I want a secret project built" } as typeof LEAD);
    expect(JSON.stringify(posthogMock.capture.mock.calls)).not.toMatch(/secret project/);
    expect(JSON.stringify(posthogMock.identify.mock.calls)).not.toMatch(/secret project/);
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/secret project/);
  });

  it("is a no-op for PostHog when it is not loaded, and does not throw", () => {
    posthogMock.__loaded = false;
    expect(() => trackLeadSubmitted(LEAD)).not.toThrow();
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("does not identify on an email that is empty after trimming, but still counts the lead", () => {
    trackLeadSubmitted({ ...LEAD, email: "   " });
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
  });

  it("swallows an analytics failure and reports it", () => {
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    posthogMock.identify.mockImplementation(() => {
      throw new Error("posthog exploded");
    });
    expect(() => trackLeadSubmitted(LEAD)).not.toThrow();
    expect(report).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

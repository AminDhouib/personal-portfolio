import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_VISIT_ATTRIBUTION,
  getVisitAttribution,
  parseVisitAttribution,
  recordVisitAttribution,
  resetVisitAttributionForTests,
} from "../visit-attribution";

const HOME = "https://amindhou.com/";

describe("parseVisitAttribution", () => {
  it("reads the three UTM values and the landing path", () => {
    expect(
      parseVisitAttribution(
        "https://amindhou.com/work?utm_source=newsletter&utm_medium=email&utm_campaign=spring",
        "",
      ),
    ).toEqual({
      source: "newsletter",
      medium: "email",
      campaign: "spring",
      referrer: "",
      referring_domain: "",
      landing_page: "/work",
    });
  });

  it("leaves the UTM fields empty when the URL carries none", () => {
    expect(parseVisitAttribution("https://amindhou.com/blog/post", "")).toMatchObject({
      source: "",
      medium: "",
      campaign: "",
      landing_page: "/blog/post",
    });
  });

  it("keeps the landing path only: no query string and no hash", () => {
    const parsed = parseVisitAttribution("https://amindhou.com/ai?token=abc&utm_source=x#frag", "");
    expect(parsed.landing_page).toBe("/ai");
  });

  it("records the referrer as origin plus path, with its domain, dropping the query", () => {
    expect(
      parseVisitAttribution(HOME, "https://www.google.com/search?q=amin+dhouib&sca_esv=1"),
    ).toMatchObject({
      referrer: "https://www.google.com/search",
      referring_domain: "www.google.com",
    });
  });

  it("ignores a referrer from the site itself", () => {
    expect(parseVisitAttribution(HOME, "https://amindhou.com/work")).toMatchObject({
      referrer: "",
      referring_domain: "",
    });
  });

  it("survives an unparseable referrer or URL", () => {
    expect(parseVisitAttribution(HOME, "not a url")).toMatchObject({ referrer: "" });
    expect(parseVisitAttribution("::::", "")).toEqual(EMPTY_VISIT_ATTRIBUTION);
  });

  it("caps each value so a hostile link cannot bloat an event", () => {
    const long = "a".repeat(500);
    const parsed = parseVisitAttribution(`${HOME}?utm_source=${long}`, "");
    expect(parsed.source).toHaveLength(100);
  });
});

describe("recordVisitAttribution / getVisitAttribution", () => {
  beforeEach(() => {
    resetVisitAttributionForTests();
    window.sessionStorage.clear();
    window.history.pushState({}, "", "/work?utm_source=li&utm_medium=social");
    vi.spyOn(document, "referrer", "get").mockReturnValue("https://news.ycombinator.com/item?id=1");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("is empty before anything is recorded", () => {
    expect(getVisitAttribution()).toEqual(EMPTY_VISIT_ATTRIBUTION);
  });

  it("captures the first page of the visit", () => {
    recordVisitAttribution();
    expect(getVisitAttribution()).toEqual({
      source: "li",
      medium: "social",
      campaign: "",
      referrer: "https://news.ycombinator.com/item",
      referring_domain: "news.ycombinator.com",
      landing_page: "/work",
    });
  });

  it("keeps the first touch when a later page records again", () => {
    recordVisitAttribution();
    window.history.pushState({}, "", "/games?utm_source=other");
    recordVisitAttribution();
    expect(getVisitAttribution()).toMatchObject({ source: "li", landing_page: "/work" });
  });

  it("survives a hard reload within the session through sessionStorage", () => {
    recordVisitAttribution();
    resetVisitAttributionForTests();
    window.history.pushState({}, "", "/ai");
    expect(getVisitAttribution()).toMatchObject({ source: "li", landing_page: "/work" });
  });

  it("falls back to memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    recordVisitAttribution();
    expect(getVisitAttribution()).toMatchObject({ source: "li", landing_page: "/work" });
  });

  it("ignores a corrupt stored value and records afresh", () => {
    window.sessionStorage.setItem("visit:attribution:v1", "{not json");
    vi.stubGlobal("reportError", vi.fn());
    recordVisitAttribution();
    expect(getVisitAttribution()).toMatchObject({ source: "li", landing_page: "/work" });
    vi.unstubAllGlobals();
  });
});

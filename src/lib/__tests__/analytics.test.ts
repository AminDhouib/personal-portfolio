import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { posthogMock } = vi.hoisted(() => ({
  posthogMock: { __loaded: false, capture: vi.fn() },
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

import { BOOKING_URL } from "@/data/nav";
import { conversionForLink, track } from "../analytics";

function anchorIn(html: string, selector = "a"): HTMLAnchorElement {
  document.body.innerHTML = html;
  const anchor = document.querySelector(selector);
  if (!(anchor instanceof HTMLAnchorElement)) throw new Error("no anchor");
  return anchor;
}

describe("track", () => {
  beforeEach(() => {
    posthogMock.__loaded = false;
    posthogMock.capture.mockClear();
  });
  afterEach(() => {
    Reflect.deleteProperty(window, "gtag");
  });

  it("is a no-op when no analytics sink is loaded", () => {
    expect(() => track("book_call_click", { placement: "hero" })).not.toThrow();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("sends the event to PostHog once it is initialised", () => {
    posthogMock.__loaded = true;
    track("chat_open", { path: "/" });
    expect(posthogMock.capture).toHaveBeenCalledWith("chat_open", { path: "/" });
  });

  it("sends the event to GA4 when gtag.js is on the page", () => {
    const gtag = vi.fn();
    Object.assign(window, { gtag });
    track("email_click");
    expect(gtag).toHaveBeenCalledWith("event", "email_click", {});
  });
});

describe("conversionForLink", () => {
  it("tags a Book a Call link with the section it sits in", () => {
    const anchor = anchorIn(`<section id="hero"><a href="${BOOKING_URL}">Book</a></section>`);
    expect(conversionForLink(anchor, "/")).toEqual({
      event: "book_call_click",
      props: { placement: "hero", path: "/" },
    });
  });

  it("falls back to the navbar and footer when the link is outside a section", () => {
    expect(
      conversionForLink(anchorIn(`<nav><a href="${BOOKING_URL}">Book</a></nav>`), "/blog"),
    ).toMatchObject({ props: { placement: "navbar", path: "/blog" } });
    expect(
      conversionForLink(
        anchorIn(`<footer><a href="mailto:amin@devino.ca">Email</a></footer>`),
        "/",
      ),
    ).toEqual({ event: "email_click", props: { placement: "footer", path: "/" } });
    expect(conversionForLink(anchorIn(`<a href="${BOOKING_URL}">Book</a>`), "/")).toMatchObject({
      props: { placement: "page" },
    });
  });

  it("names the network for a social profile link, trailing slash or not", () => {
    const anchor = anchorIn(`<footer><a href="https://github.com/AminDhouib/">GitHub</a></footer>`);
    expect(conversionForLink(anchor, "/work")).toEqual({
      event: "social_click",
      props: { network: "GitHub", placement: "footer", path: "/work" },
    });
  });

  it("ignores ordinary navigation", () => {
    expect(conversionForLink(anchorIn(`<a href="/blog">Blog</a>`), "/")).toBeNull();
    expect(conversionForLink(anchorIn(`<a href="https://example.com">x</a>`), "/")).toBeNull();
  });
});

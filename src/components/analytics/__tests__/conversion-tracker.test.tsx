import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BOOKING_URL } from "@/data/nav";
import { ConversionTracker } from "../conversion-tracker";

describe("ConversionTracker", () => {
  // Bubble-phase listener on window: runs after the tracker's capture-phase
  // one, records whether anything before it blocked the link, then stops the
  // navigation jsdom cannot perform.
  let defaultPreventedBeforeUs: boolean | null = null;
  const stopNavigation = (event: MouseEvent) => {
    defaultPreventedBeforeUs = event.defaultPrevented;
    event.preventDefault();
  };

  beforeEach(() => {
    defaultPreventedBeforeUs = null;
    window.addEventListener("click", stopNavigation);
  });
  afterEach(() => {
    window.removeEventListener("click", stopNavigation);
    Reflect.deleteProperty(window, "gtag");
  });

  it("records a Book a Call click anywhere on the page, without blocking the link", () => {
    const gtag = vi.fn();
    Object.assign(window, { gtag });
    render(
      <>
        <ConversionTracker />
        <section id="contact">
          <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
            <span>Book a Call</span>
          </a>
        </section>
      </>,
    );

    // The click lands on the inner span; the tracker resolves the enclosing link.
    fireEvent.click(screen.getByText("Book a Call"));
    expect(defaultPreventedBeforeUs).toBe(false);
    expect(gtag).toHaveBeenCalledWith("event", "book_call_click", {
      placement: "contact",
      path: window.location.pathname,
    });
  });

  it("ignores clicks that are not on a conversion link", () => {
    const gtag = vi.fn();
    Object.assign(window, { gtag });
    render(
      <>
        <ConversionTracker />
        <a href="#work">Explore</a>
        <button type="button">Not a link</button>
      </>,
    );
    fireEvent.click(screen.getByText("Explore"));
    fireEvent.click(screen.getByText("Not a link"));
    expect(gtag).not.toHaveBeenCalled();
  });

  it("stops listening when unmounted", () => {
    const gtag = vi.fn();
    Object.assign(window, { gtag });
    const { unmount } = render(<ConversionTracker />);
    unmount();
    render(<a href={BOOKING_URL}>Book</a>);
    fireEvent.click(screen.getByText("Book"));
    expect(gtag).not.toHaveBeenCalled();
  });
});

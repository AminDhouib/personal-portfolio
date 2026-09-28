import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BOOKING_URL } from "@/data/nav";
import { SiteLinks } from "@/components/layout/site-links";
import { BookCallCta } from "../book-call-cta";

describe("BookCallCta", () => {
  it("links to the booking page in a new tab without leaking the opener", () => {
    render(<BookCallCta title="Need this built?" body="Book a call." />);
    const link = screen.getByRole("link", { name: /book a call/i });
    expect(link).toHaveAttribute("href", BOOKING_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("heading", { name: "Need this built?" })).toBeInTheDocument();
  });

  it("shows the decorative headshot only on the author variant", () => {
    const { container, rerender } = render(<BookCallCta title="t" body="b" />);
    expect(container.querySelector("img")).toBeNull();
    rerender(<BookCallCta title="t" body="b" showAvatar />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});

describe("SiteLinks", () => {
  it("links every top-level page from the footer", () => {
    render(<SiteLinks />);
    const nav = screen.getByRole("navigation", { name: "Site pages" });
    const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/work", "/blog", "/reviews", "/games", "/ai", "/feed.xml"]);
  });
});

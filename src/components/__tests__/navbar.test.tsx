import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Navbar } from "../navbar";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/ui/social-links", () => ({ SocialLinks: () => null }));

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function blurLayer(): HTMLElement {
  const layer = document.querySelector<HTMLElement>("nav > div[aria-hidden='true']");
  if (!layer) throw new Error("navbar blur layer not found");
  return layer;
}

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("Navbar blur layer", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderNavbar() {
    vi.stubGlobal("IntersectionObserver", NoopObserver);
    scrollTo(0);
    return render(<Navbar />);
  }

  it("keeps the blur always on and fades only its opacity", () => {
    renderNavbar();
    const layer = blurLayer();
    expect(layer.classList.contains("backdrop-blur-xl")).toBe(true);
    expect(layer.classList.contains("transition-opacity")).toBe(true);
    expect(layer.classList.contains("duration-(--motion-dur-base)")).toBe(true);
    expect(layer.classList.contains("pointer-events-none")).toBe(true);
    expect(layer.classList.contains("transition-all")).toBe(false);
    expect(layer.classList.contains("transition")).toBe(false);
    expect(layer.className).not.toContain("backdrop-filter");
  });

  it("is transparent at the top and opaque once scrolled past one navbar height", () => {
    renderNavbar();
    expect(blurLayer().classList.contains("opacity-0")).toBe(true);
    expect(blurLayer().classList.contains("opacity-100")).toBe(false);

    scrollTo(200);
    expect(blurLayer().classList.contains("opacity-100")).toBe(true);
    expect(blurLayer().classList.contains("opacity-0")).toBe(false);
  });

  it("puts no filter or transition on the nav itself, so the fixed mobile menu keeps the viewport as its containing block", () => {
    renderNavbar();
    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    for (const cls of [
      "backdrop-blur",
      "backdrop-blur-xl",
      "transition",
      "transition-all",
      "transition-[background-color,backdrop-filter]",
    ]) {
      expect(nav?.classList.contains(cls)).toBe(false);
    }
    expect(nav?.className).not.toContain("backdrop");

    scrollTo(200);
    expect(nav?.className).not.toContain("backdrop");
  });

  it("renders the mobile panel as a sibling of the blur layer, not inside it", () => {
    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));
    const layer = blurLayer();
    const panel = Array.from(document.querySelectorAll<HTMLElement>("nav div.fixed")).find((el) =>
      el.classList.contains("w-72"),
    );
    expect(panel).toBeDefined();
    expect(layer.contains(panel as HTMLElement)).toBe(false);
    expect(panel?.closest("nav")).toBe(layer.parentElement);
  });
});

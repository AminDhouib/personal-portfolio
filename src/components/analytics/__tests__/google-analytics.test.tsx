import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { GoogleAnalytics } from "../google-analytics";

// Stub next/script with a plain element (not a real <script>, which would trip
// @next/next/no-sync-scripts): next/script's afterInteractive scripts inject
// asynchronously and render nothing synchronously under jsdom, so this
// passthrough lets us assert the gating logic and the emitted measurement id.
vi.mock("next/script", () => ({
  default: ({ id, src, children }: { id?: string; src?: string; children?: ReactNode }) => (
    <div data-testid="next-script" data-id={id} data-src={src}>
      {children}
    </div>
  ),
}));

const GA_ID = "NEXT_PUBLIC_GA4_ID";

afterEach(() => {
  delete process.env[GA_ID];
});

describe("GoogleAnalytics", () => {
  it("renders nothing when NEXT_PUBLIC_GA4_ID is unset", () => {
    delete process.env[GA_ID];
    const { container } = render(<GoogleAnalytics />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the gtag loader and inline init carrying the measurement id when set", () => {
    process.env[GA_ID] = "G-TEST12345";
    const { getAllByTestId } = render(<GoogleAnalytics />);
    const scripts = getAllByTestId("next-script");
    expect(scripts).toHaveLength(2);
    expect(scripts[0]?.getAttribute("data-src")).toContain("id=G-TEST12345");
    expect(scripts[1]?.textContent).toContain("G-TEST12345");
  });
});

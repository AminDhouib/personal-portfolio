import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- server-render stand-in for next/image
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { Hero } from "../hero";

// The hero is the LCP. Its server HTML must already be at the final state: nothing at opacity 0
// and no entrance offset, or the paint waits for hydration plus a fade.
describe("Hero server HTML", () => {
  const html = renderToString(<Hero />);

  it("renders the text and photo columns", () => {
    expect(html).toContain("Portfolio /");
    expect(html).toContain('src="/profile.png"');
  });

  it("has no inline style that hides or offsets any hero element", () => {
    const styles = [...html.matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]);
    for (const style of styles) {
      expect(style).not.toMatch(/opacity\s*:\s*0(?![.\d])/);
      expect(style).not.toMatch(/transform|translate|scale/);
    }
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { useEffect } from "react";
import { render, cleanup, screen, act } from "@testing-library/react";

vi.mock("../effects", () => ({
  themes: {
    default: () =>
      Promise.resolve({
        name: "fake",
        BombFlip: () => null,
        CoinReveal: () => null,
        Win: () => null,
      }),
  },
}));

import { EffectsProvider, useEffectsTheme } from "../effects/context";

let mounts = 0;

function Probe() {
  const theme = useEffectsTheme();
  useEffect(() => {
    mounts += 1;
  }, []);
  return <p>{theme ? theme.name : "no theme"}</p>;
}

afterEach(() => {
  cleanup();
  mounts = 0;
});

describe("EffectsProvider", () => {
  it("hands the theme down without remounting its children", async () => {
    render(
      <EffectsProvider>
        <Probe />
      </EffectsProvider>,
    );
    expect(screen.getByText("no theme")).toBeTruthy();

    // Let the dynamic theme import settle.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("fake")).toBeTruthy();
    expect(mounts).toBe(1);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createRun } from "../../engine/engine";
import { ReceiptCard } from "../receipt-card";

describe("ReceiptCard date", () => {
  // CI runs under UTC; pin a zone behind UTC so the local and UTC days differ.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Toronto";
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("prints the UTC day, not the local one (a 21:00 run at UTC-5 is already the next UTC day)", () => {
    // 2026-10-09T02:00Z is 22:00 on the 8th in Toronto.
    vi.setSystemTime(new Date("2026-10-09T02:00:00Z"));
    const g = createRun({ seed: 7, daily: true, nowHHMM: () => "12:00" });
    const { container } = render(
      <ReceiptCard
        g={g}
        seed={7}
        daily
        onCopySeed={() => {}}
        onPlayAgain={() => {}}
        onPlayDaily={() => {}}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("2026-10-09");
    expect(text).not.toContain("2026-10-08");
  });
});

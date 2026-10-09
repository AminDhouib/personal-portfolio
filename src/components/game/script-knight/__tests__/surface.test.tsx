import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventLog } from "../event-log";
import { FloorView } from "../floor-view";
import { glyphColor } from "../glyphs";
import { ResultCard } from "../result-card";
import { GAME_SURFACE } from "../surface";
import { TextareaEditor } from "../textarea-editor";
import { towerFrames } from "./frames";

afterEach(cleanup);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

function pick(pattern: RegExp): string {
  const found = pattern.exec(GAME_SURFACE)?.[1];
  if (!found) throw new Error(`GAME_SURFACE has no ${pattern}`);
  return found;
}

const BACKGROUND = pick(/(?:^|\s)bg-\[(#[0-9a-f]{6})\]/);
const TEXT = pick(/(?:^|\s)text-\[(#[0-9a-f]{6})\]/);
const MUTED = pick(/--muted:(#[0-9a-f]{6})/);
const FOREGROUND = pick(/--foreground:(#[0-9a-f]{6})/);

describe("the game surface", () => {
  it("reads at 4.5:1 for text in both site themes, because it is a fixed dark panel", () => {
    for (const colour of [TEXT, FOREGROUND, MUTED, "#4ade80", "#fca5a5"]) {
      expect(contrast(colour, BACKGROUND)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("shows every glyph and the floor wall at 3:1 or better", () => {
    for (const kind of [
      "knight",
      "sludge",
      "thick-sludge",
      "archer",
      "wizard",
      "captive",
    ] as const) {
      expect(contrast(glyphColor(kind), BACKGROUND)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast("#64748b", BACKGROUND)).toBeGreaterThanOrEqual(3);
  });

  it("is what the floor, the log, the result card and the editor are drawn on", () => {
    const [start] = towerFrames("narrow-path", 1, []);
    const view = render(<FloorView frame={start!} label="x" />);
    const floor = view.container.querySelector("svg")?.getAttribute("class") ?? "";
    cleanup();
    const log = render(<EventLog frames={[start!]} index={0} thoughts={[]} />);
    const logClass = log.getByRole("log").className;
    cleanup();
    const editor = render(
      <TextareaEditor value="" onChange={() => {}} onRun={() => {}} disabled />,
    );
    const editorClass = editor.getByRole("textbox").className;
    cleanup();
    const passed = render(
      <ResultCard
        result={
          {
            passed: true,
            turns: 7,
            score: { warrior: 0, timeBonus: 1, clearBonus: 2, total: 3 },
            grade: 1,
          } as never
        }
        reason={null}
        clue={null}
        hasNextFloor
        onNext={() => {}}
        onRetry={() => {}}
      />,
    );
    const passedClass = passed.getByRole("region", { name: "Result" }).className;
    cleanup();
    const failed = render(
      <ResultCard
        result={{ passed: false, turns: 7, score: null, grade: null } as never}
        reason="x"
        clue={null}
        hasNextFloor={false}
        onNext={() => {}}
        onRetry={() => {}}
      />,
    );
    const failedClass = failed.getByRole("region", { name: "Result" }).className;
    for (const className of [floor, logClass, editorClass, passedClass, failedClass]) {
      expect(className).toContain(`bg-[${BACKGROUND}]`);
      expect(className).toContain("--foreground");
      expect(className).not.toContain("bg-black");
    }
  });
});

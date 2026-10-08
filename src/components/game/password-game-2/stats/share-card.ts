import { formatClock } from "./stats";
import type { ShareOutcome } from "./share";

export const CARD_W = 1200;
export const CARD_H = 630;

export type ShareCardInput = { day: string; ms: number; streak: number };

const INK = "#0f172a";
const PAPER = "#f8fafc";
const MUTED = "#475569";
const ACCENT = "#2563eb";

/** Draws the 1200x630 result card: time, UTC day and (from two days up) the streak. */
export function drawShareCard(ctx: CanvasRenderingContext2D, run: ShareCardInput): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, CARD_W, 24);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = MUTED;
  ctx.font = "600 44px sans-serif";
  ctx.fillText("THE PASSWORD GAME 2", CARD_W / 2, 90);

  ctx.fillStyle = INK;
  ctx.font = "700 220px monospace";
  ctx.fillText(formatClock(run.ms), CARD_W / 2, 190);

  ctx.fillStyle = MUTED;
  ctx.font = "500 44px sans-serif";
  ctx.fillText(`Daily ${run.day}`, CARD_W / 2, 450);
  if (run.streak >= 2) {
    ctx.fillStyle = ACCENT;
    ctx.fillText(`${run.streak}-day streak`, CARD_W / 2, 510);
  }
}

/** True when the browser can share an image file through the native share sheet. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([], "x.png", { type: "image/png" })] });
  } catch {
    // silent-ok: a browser that throws on canShare simply gets the text path
    return false;
  }
}

/** Renders the card to a PNG blob, or null when there is no canvas or drawing fails. */
export async function renderShareCardBlob(run: ShareCardInput): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawShareCard(ctx, run);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    // silent-ok: a canvas that fails just means the share goes out as the text line
    return null;
  }
}

/** Shares the card with the text line. A dismissed sheet is "cancelled"; any failure is null. */
export async function shareCardImage(blob: Blob, text: string): Promise<ShareOutcome | null> {
  const file = new File([blob], "password-game-2.png", { type: "image/png" });
  try {
    await navigator.share({ files: [file], text });
    return "shared";
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    // silent-ok: the caller falls back to the text path
    return null;
  }
}

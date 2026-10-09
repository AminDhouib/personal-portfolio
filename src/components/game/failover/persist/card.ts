import type { GameMode } from "../sim/types";
import { T, fmt } from "../strings";
import { clock } from "../ui/format";

// The share card: a frame of the board (scene.capture, a fresh render copied
// out in the same task, so no preserveDrawingBuffer) with a band under it that
// names the run and carries the site's address, as a PNG to download or to
// hand to the OS share sheet.

export const CARD_WATERMARK = "amindhou.com/games/failover";
export const CARD_FILE = "failover-build.png";

export interface CardInfo {
  mode: GameMode;
  seconds: number;
  score: number;
  services: number;
}

/** The frame with its band, or null for an empty frame or a browser with no 2D canvas. */
export function composeCard(frame: HTMLCanvasElement, info: CardInfo): HTMLCanvasElement | null {
  const { width, height } = frame;
  if (width <= 0 || height <= 0) return null;
  const band = Math.max(56, Math.round(width * 0.09));
  const card = document.createElement("canvas");
  card.width = width;
  card.height = height + band;
  const ctx = card.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, card.width, card.height);
  ctx.drawImage(frame, 0, 0);

  const pad = Math.round(band * 0.3);
  const mid = height + band / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ededed";
  ctx.font = `700 ${Math.round(band * 0.36)}px system-ui, sans-serif`;
  ctx.fillText(T.card_title, pad, mid - band * 0.14);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = `${Math.round(band * 0.22)}px system-ui, sans-serif`;
  const line =
    info.mode === "sandbox"
      ? fmt(T.card_sandbox, { services: info.services })
      : fmt(T.card_survival, {
          time: clock(info.seconds),
          score: Math.round(info.score).toLocaleString("en-US"),
        });
  ctx.fillText(line, pad, mid + band * 0.22);
  ctx.textAlign = "right";
  ctx.fillStyle = "#06b6d4";
  ctx.font = `${Math.round(band * 0.24)}px ui-monospace, monospace`;
  ctx.fillText(CARD_WATERMARK, width - pad, mid);
  return card;
}

/** The card as a PNG, or null when the browser cannot encode one. */
export function cardBlob(card: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => card.toBlob(resolve, "image/png"));
}

/** Save the PNG through a download link. */
export function downloadCard(png: Blob): void {
  const url = URL.createObjectURL(png);
  const link = document.createElement("a");
  link.href = url;
  link.download = CARD_FILE;
  link.click();
  // Some browsers read the URL after click() returns; let it go a little later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ShareOutcome = "shared" | "cancelled" | "failed" | "unsupported";

/** Hand the PNG to the OS share sheet, where the browser can share files. */
export async function shareCard(png: Blob): Promise<ShareOutcome> {
  const file = new File([png], CARD_FILE, { type: "image/png" });
  const data: ShareData = { files: [file], title: T.card_title };
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return "unsupported";
  }
  if (!navigator.canShare(data)) return "unsupported";
  try {
    await navigator.share(data);
    return "shared";
  } catch (err) {
    // silent-ok: the caller says what happened; a closed share sheet is the player's choice, not a fault
    return err instanceof DOMException && err.name === "AbortError" ? "cancelled" : "failed";
  }
}

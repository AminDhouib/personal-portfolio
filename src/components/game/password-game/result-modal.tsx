"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy, X, Download, Send, Loader2, CheckCircle } from "lucide-react";
import { formatTime, computeDifficultyRating, pickResultTitle } from "./result-card-util";

interface Props {
  open: boolean;
  seed: number;
  timeSeconds: number;
  rulesCleared: number;
  tiers: number[];
  onClose: () => void;
}

type SubmitState = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; rank: number } | { kind: "error"; message: string };

export function ResultModal({ open, seed, timeSeconds, rulesCleared, tiers, onClose }: Props) {
  const [name, setName] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const difficulty = computeDifficultyRating(tiers);
  const title = pickResultTitle({ timeSeconds, rulesCleared, tiers });

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    drawCard(canvasRef.current, { title, seed, timeSeconds, rulesCleared, difficulty });
  }, [open, title, seed, timeSeconds, rulesCleared, difficulty]);

  if (!open) return null;

  const handleSubmit = async () => {
    setSubmit({ kind: "sending" });
    try {
      const res = await fetch("/api/password-game/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          seed,
          time: timeSeconds,
          rules: rulesCleared,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmit({ kind: "error", message: (data as { error?: string }).error ?? "submit failed" });
        return;
      }
      const data = (await res.json()) as { rank: number };
      setSubmit({ kind: "sent", rank: data.rank });
    } catch (err) {
      setSubmit({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `password-game-2-seed-${seed}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-(--border) bg-(--card) p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-(--muted) hover:text-(--foreground)"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-5 w-5 text-accent-amber" />
          <h2 className="font-display text-xl font-bold">{title}</h2>
        </div>

        <canvas
          ref={canvasRef}
          width={600}
          height={360}
          className="w-full rounded-lg border border-(--border) mb-4"
        />

        <div className="grid grid-cols-3 gap-3 text-center text-sm mb-4">
          <div>
            <div className="text-(--muted) text-xs">Time</div>
            <div className="font-mono font-bold">{formatTime(timeSeconds)}</div>
          </div>
          <div>
            <div className="text-(--muted) text-xs">Rules</div>
            <div className="font-mono font-bold">{rulesCleared}</div>
          </div>
          <div>
            <div className="text-(--muted) text-xs">Difficulty</div>
            <div className="font-mono font-bold">{"*".repeat(difficulty)}</div>
          </div>
        </div>

        {submit.kind !== "sent" ? (
          <div className="space-y-2">
            <label className="flex gap-2 items-center">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={16}
                className="flex-1 rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
                disabled={submit.kind === "sending"}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submit.kind === "sending"}
                className="inline-flex items-center gap-1 rounded-md border border-accent-pink/50 bg-accent-pink/10 text-accent-pink px-3 py-2 text-sm font-medium hover:bg-accent-pink/20 disabled:opacity-60"
              >
                {submit.kind === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit
              </button>
            </label>
            {submit.kind === "error" && (
              <div className="text-xs text-red-400">{submit.message}</div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-accent-green">
            <CheckCircle className="h-4 w-4" />
            Submitted. Rank #{submit.rank}.
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={handleDownload}
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-(--border) px-3 py-2 text-sm hover:bg-(--background)"
          >
            <Download className="h-4 w-4" />
            Download card
          </button>
          <a
            href="/games/password-game/leaderboard"
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-(--border) px-3 py-2 text-sm hover:bg-(--background)"
          >
            <Trophy className="h-4 w-4" />
            Leaderboard
          </a>
        </div>
      </div>
    </div>
  );
}

interface DrawInput {
  title: string;
  seed: number;
  timeSeconds: number;
  rulesCleared: number;
  difficulty: number;
}

function drawCard(canvas: HTMLCanvasElement, d: DrawInput) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0a0a14");
  bg.addColorStop(1, "#20102a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Accent border
  ctx.strokeStyle = "#ff3366";
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Password Game 2", 28, 48);

  // Subtitle (result title)
  ctx.fillStyle = "#ff3366";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText(d.title, 28, 80);

  // Stats grid
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px system-ui, sans-serif";

  const yStart = 140;
  const rowGap = 38;

  drawStat(ctx, "TIME", formatTime(d.timeSeconds), 28, yStart);
  drawStat(ctx, "RULES CLEARED", String(d.rulesCleared), 28, yStart + rowGap);
  drawStat(ctx, "DIFFICULTY", "*".repeat(d.difficulty), 28, yStart + rowGap * 2);
  drawStat(ctx, "SEED", String(d.seed), 28, yStart + rowGap * 3);

  // Footer
  ctx.fillStyle = "#888888";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("amindhou.com/games/password-game", w - 20, h - 20);
}

function drawStat(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number) {
  ctx.fillStyle = "#888888";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px monospace";
  ctx.fillText(value, x, y + 18);
}

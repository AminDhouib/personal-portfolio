"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface GameState {
  state: "idle" | "playing" | "dead";
  score: number;
  highScore: number;
}

interface Shape {
  x: number;
  y: number;
  size: number;
  type: "circle" | "triangle" | "diamond";
  speed: number;
  rotation: number;
  rotationSpeed: number;
}

interface Player {
  lane: number; // 0, 1, 2
  x: number;
  y: number;
  targetY: number;
  pulsePhase: number;
}

const LANES = 3;
const CANVAS_HEIGHT = 420;
const PLAYER_X = 120;
const HS_KEY = "geometric_flow_hs";

function drawWireframeCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWireframeTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(angle) * size;
    const py = Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawWireframeDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  rotation: number,
  color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.6, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.6, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawPlayerTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  pulse: number
) {
  const glowAlpha = 0.2 + Math.sin(pulse) * 0.1;
  // Glow
  ctx.shadowColor = "#22c55e";
  ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(34, 197, 94, ${glowAlpha})`;
  ctx.beginPath();
  ctx.arc(x, y, size + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Filled triangle pointing right
  ctx.fillStyle = "#22c55e";
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + size, y);
  ctx.lineTo(x - size * 0.6, y - size * 0.8);
  ctx.lineTo(x - size * 0.6, y + size * 0.8);
  ctx.closePath();
  ctx.fill();
}

export function GeometricFlowGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    state: "idle",
    score: 0,
    highScore: 0,
  });
  const playerRef = useRef<Player>({ lane: 1, x: PLAYER_X, y: 0, targetY: 0, pulsePhase: 0 });
  const shapesRef = useRef<Shape[]>([]);
  const frameRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const speedMultiplierRef = useRef<number>(1);
  const [uiState, setUiState] = useState<GameState>({
    state: "idle",
    score: 0,
    highScore: 0,
  });

  const getLaneY = useCallback((canvas: HTMLCanvasElement, lane: number) => {
    const padding = 80;
    const usable = canvas.height - padding * 2;
    return padding + (lane / (LANES - 1)) * usable;
  }, []);

  const spawnShape = useCallback((canvas: HTMLCanvasElement) => {
    const types: Shape["type"][] = ["circle", "triangle", "diamond"];
    const lane = Math.floor(Math.random() * LANES);
    shapesRef.current.push({
      x: canvas.width + 60,
      y: getLaneY(canvas, lane),
      size: 22 + Math.random() * 16,
      type: types[Math.floor(Math.random() * 3)],
      speed: (180 + Math.random() * 80) * speedMultiplierRef.current,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 2,
    });
  }, [getLaneY]);

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    shapesRef.current = [];
    lastSpawnRef.current = 0;
    speedMultiplierRef.current = 1;
    playerRef.current = {
      lane: 1,
      x: PLAYER_X,
      y: getLaneY(canvas, 1),
      targetY: getLaneY(canvas, 1),
      pulsePhase: 0,
    };
    const hs = parseInt(localStorage.getItem(HS_KEY) ?? "0");
    stateRef.current = { state: "playing", score: 0, highScore: hs };
    setUiState({ ...stateRef.current });
  }, [getLaneY]);

  const handleInput = useCallback(() => {
    const gs = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (gs.state === "idle" || gs.state === "dead") {
      resetGame();
      return;
    }

    // Cycle lanes down, then wrap to top
    const p = playerRef.current;
    p.lane = (p.lane + 1) % LANES;
    p.targetY = getLaneY(canvas, p.lane);
  }, [getLaneY, resetGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hs = parseInt(localStorage.getItem(HS_KEY) ?? "0");
    stateRef.current.highScore = hs;
    playerRef.current.y = getLaneY(canvas, 1);
    playerRef.current.targetY = getLaneY(canvas, 1);
    playerRef.current.x = PLAYER_X;
    setUiState((s) => ({ ...s, highScore: hs }));

    let lastTime = 0;

    function gameLoop(timestamp: number) {
      const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;
      const gs = stateRef.current;
      const p = playerRef.current;

      // Clear
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      if (gs.state === "idle") {
        drawIdle(ctx!, canvas!);
      } else if (gs.state === "playing") {
        // Score
        gs.score += dt * 10;
        speedMultiplierRef.current = 1 + gs.score * 0.0015;

        // Spawn
        const spawnInterval = Math.max(0.6, 1.4 - gs.score * 0.005);
        if (timestamp - lastSpawnRef.current > spawnInterval * 1000) {
          spawnShape(canvas!);
          lastSpawnRef.current = timestamp;
        }

        // Move player
        p.y += (p.targetY - p.y) * 12 * dt;
        p.pulsePhase += dt * 3;

        // Move shapes
        for (let i = shapesRef.current.length - 1; i >= 0; i--) {
          const s = shapesRef.current[i];
          s.x -= s.speed * dt;
          s.rotation += s.rotationSpeed * dt;
          if (s.x < -100) {
            shapesRef.current.splice(i, 1);
          }
        }

        // Collision detection
        const playerSize = 14;
        for (const s of shapesRef.current) {
          const dx = p.x - s.x;
          const dy = p.y - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < playerSize + s.size * 0.65) {
            gs.state = "dead";
            if (gs.score > gs.highScore) {
              gs.highScore = gs.score;
              localStorage.setItem(HS_KEY, String(Math.floor(gs.score)));
            }
            setUiState({ ...gs });
            break;
          }
        }

        // Draw lane guides
        drawLaneGuides(ctx!, canvas!);

        // Draw shapes
        for (const s of shapesRef.current) {
          const shapeColor = "rgba(99,102,241,0.6)";
          if (s.type === "circle")
            drawWireframeCircle(ctx!, s.x, s.y, s.size, shapeColor);
          else if (s.type === "triangle")
            drawWireframeTriangle(ctx!, s.x, s.y, s.size, s.rotation, shapeColor);
          else drawWireframeDiamond(ctx!, s.x, s.y, s.size, s.rotation, shapeColor);
        }

        // Draw player
        drawPlayerTriangle(ctx!, p.x, p.y, 14, p.pulsePhase);

        // Draw HUD
        drawHUD(ctx!, canvas!, gs);
      } else if (gs.state === "dead") {
        drawDeadScreen(ctx!, canvas!, gs);
      }

      frameRef.current = requestAnimationFrame(gameLoop);
    }

    frameRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [getLaneY, spawnShape]);

  // Helpers
  function drawIdle(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    ctx.fillStyle = "rgba(34,197,94,0.6)";
    ctx.font = "bold 16px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("TAP TO PLAY", canvas.width / 2, canvas.height / 2 + 6);

    // Draw demo shapes drifting
    ctx.strokeStyle = "rgba(99,102,241,0.3)";
    ctx.lineWidth = 1;
    const t = Date.now() / 1000;
    drawWireframeCircle(
      ctx,
      canvas.width * 0.3 + Math.sin(t) * 20,
      canvas.height * 0.4,
      28,
      "rgba(6,182,212,0.35)"
    );
    drawWireframeTriangle(
      ctx,
      canvas.width * 0.7,
      canvas.height * 0.55 + Math.cos(t * 0.8) * 15,
      22,
      t * 0.5,
      "rgba(99,102,241,0.35)"
    );
    drawWireframeDiamond(
      ctx,
      canvas.width * 0.5,
      canvas.height * 0.25,
      18,
      t * 0.7,
      "rgba(167,139,250,0.35)"
    );
  }

  function drawLaneGuides(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement
  ) {
    for (let lane = 0; lane < LANES; lane++) {
      const y = getLaneY(canvas, lane);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawHUD(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    gs: GameState
  ) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "700 14px 'Space Grotesk', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE  ${Math.floor(gs.score)}`, 16, 24);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(34,197,94,0.7)";
    ctx.fillText(`BEST  ${Math.floor(gs.highScore)}`, canvas.width - 16, 24);
    ctx.textAlign = "left";
  }

  function drawDeadScreen(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    gs: GameState
  ) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 20px 'Outfit', sans-serif";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 32);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "16px 'Space Grotesk', sans-serif";
    ctx.fillText(
      `Score: ${Math.floor(gs.score)}  |  Best: ${Math.floor(gs.highScore)}`,
      canvas.width / 2,
      canvas.height / 2 + 2
    );

    ctx.fillStyle = "rgba(34,197,94,0.8)";
    ctx.font = "bold 14px 'Space Grotesk', sans-serif";
    ctx.fillText("TAP TO RESTART", canvas.width / 2, canvas.height / 2 + 32);
    ctx.textAlign = "left";
  }

  return (
    <div className="relative w-full select-none">
      <canvas
        ref={canvasRef}
        width={800}
        height={CANVAS_HEIGHT}
        className="w-full rounded-xl border border-(--border) bg-(--card) cursor-pointer touch-none"
        style={{ maxHeight: CANVAS_HEIGHT }}
        onClick={handleInput}
        onTouchStart={(e) => {
          e.preventDefault();
          handleInput();
        }}
      />
      {uiState.state === "idle" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" />
      )}
    </div>
  );
}

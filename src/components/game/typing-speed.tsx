"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RotateCcw, Trophy, Timer, Target } from "lucide-react";

const SNIPPETS = [
  {
    label: "Next.js API Route",
    code: `export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return Response.json({ error: "Missing slug" }, { status: 400 });
  const data = await fetchFromDB(slug);
  return Response.json(data);
}`,
  },
  {
    label: "Framer Motion",
    code: `<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.5, delay: 0.1 }}
>
  {children}
</motion.div>`,
  },
  {
    label: "Docker Swarm deploy",
    code: `services:
  app:
    image: registry/portfolio:latest
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
    labels:
      - traefik.enable=true
      - traefik.http.routers.app.rule=Host(\`amindhou.com\`)`,
  },
  {
    label: "Mastra AI agent",
    code: `const agent = new Agent({
  name: "portfolio-assistant",
  model: openai("gpt-4o-mini"),
  instructions: "You help visitors learn about Amin Dhouib.",
  tools: { collectLead, recommendProject },
});`,
  },
  {
    label: "GitHub GraphQL",
    code: `const query = \`query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}\`;`,
  },
];

type GameState = "idle" | "playing" | "done";

function calcWPM(typedChars: number, elapsedMs: number): number {
  if (elapsedMs === 0) return 0;
  return Math.round((typedChars / 5) * (60000 / elapsedMs));
}

function calcAccuracy(correct: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((correct / total) * 100);
}

export function TypingSpeedGame() {
  const [snippetIdx, setSnippetIdx] = useState(0);
  const [state, setState] = useState<GameState>("idle");
  const [typed, setTyped] = useState("");
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const snippet = SNIPPETS[snippetIdx];
  const target = snippet.code;

  useEffect(() => {
    const saved = localStorage.getItem("typing-high-score");
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startGame = useCallback(() => {
    setState("playing");
    setTyped("");
    const now = Date.now();
    setStartTime(now);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - now);
    }, 100);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const resetGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("idle");
    setTyped("");
    setElapsed(0);
    setSnippetIdx((i) => (i + 1) % SNIPPETS.length);
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (state !== "playing") return;
      const val = e.target.value;

      // Only allow if it matches the target so far (no over-typing)
      if (val.length > target.length) return;

      setTyped(val);

      if (val === target) {
        if (timerRef.current) clearInterval(timerRef.current);
        setState("done");
        const wpm = calcWPM(target.length, elapsed);
        if (wpm > highScore) {
          setHighScore(wpm);
          localStorage.setItem("typing-high-score", String(wpm));
        }
      }
    },
    [state, target, elapsed, highScore]
  );

  // Derived stats
  const correctChars = typed.split("").filter((c, i) => c === target[i]).length;
  const totalTyped = typed.length;
  const currentWPM = state === "playing" ? calcWPM(totalTyped, elapsed) : calcWPM(target.length, elapsed);
  const accuracy = calcAccuracy(correctChars, totalTyped);

  // Render the target text with char-by-char highlighting
  const renderTarget = () => {
    return target.split("").map((char, i) => {
      let cls = "opacity-30"; // un-typed
      if (i < typed.length) {
        cls = typed[i] === char ? "text-accent-green" : "text-red-400 bg-red-400/10";
      } else if (i === typed.length) {
        cls = "opacity-80 border-l-2 border-accent-green animate-pulse";
      }
      // preserve whitespace rendering
      const display = char === " " ? "\u00A0" : char === "\n" ? "↵\n" : char;
      return (
        <span key={i} className={cls}>
          {display}
        </span>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5 text-(--muted)">
          <Timer className="h-3.5 w-3.5" />
          <span className={state === "playing" ? "text-accent-blue font-mono font-semibold" : "font-mono"}>
            {(elapsed / 1000).toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-(--muted)">
          <Target className="h-3.5 w-3.5" />
          <span className={state === "playing" ? "text-accent-green font-mono font-semibold" : "font-mono"}>
            {currentWPM} WPM
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-(--muted)">
          <span className="font-mono">{accuracy}% acc</span>
        </div>
        {highScore > 0 && (
          <div className="flex items-center gap-1.5 text-(--muted) ml-auto">
            <Trophy className="h-3.5 w-3.5 text-accent-amber" />
            <span className="font-mono text-accent-amber">{highScore} WPM best</span>
          </div>
        )}
      </div>

      {/* Snippet label */}
      <div className="text-xs text-(--muted) uppercase tracking-wider font-medium">
        {snippet.label}
      </div>

      {/* Code display */}
      <div
        className="relative rounded-xl border border-(--border) bg-(--card) p-4 font-mono text-sm leading-relaxed whitespace-pre cursor-text overflow-x-auto"
        onClick={() => state === "playing" && inputRef.current?.focus()}
      >
        {renderTarget()}
        {state === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-(--bg)/80 backdrop-blur-sm">
            <button
              onClick={startGame}
              className="rounded-lg bg-accent-blue px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110 transition-all"
            >
              Start typing
            </button>
          </div>
        )}
      </div>

      {/* Hidden textarea for input capture */}
      <textarea
        ref={inputRef}
        value={typed}
        onChange={handleInput}
        className="sr-only"
        aria-label="Type the code snippet"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={-1}
      />

      {/* Done overlay */}
      {state === "done" && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/5 p-6 text-center space-y-2">
          <div className="text-3xl font-black font-display text-accent-green">
            {currentWPM} WPM
          </div>
          <div className="text-sm text-(--muted)">
            {accuracy}% accuracy · {(elapsed / 1000).toFixed(1)}s
            {currentWPM >= highScore && currentWPM > 0 && (
              <span className="ml-2 text-accent-amber font-semibold">🏆 New best!</span>
            )}
          </div>
          <button
            onClick={resetGame}
            className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-4 py-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mt-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Next snippet
          </button>
        </div>
      )}

      {/* Reset button during play */}
      {state === "playing" && (
        <button
          onClick={resetGame}
          className="inline-flex items-center gap-1.5 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Skip
        </button>
      )}
    </div>
  );
}

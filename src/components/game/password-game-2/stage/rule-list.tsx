import { memo, useState } from "react";
import { Chess, type Square } from "chess.js";
import type { GameState, Pg2Rule, RuleApi, ValidationResult } from "../engine/types";

interface RuleListProps {
  rules: readonly Pg2Rule[];
  password: string;
  state: GameState;
  api: RuleApi;
  /**
   * Widget input channel. Interactive rule payloads (Tasks 9-12) call these to
   * either type their answer into the password (onWidgetText, routed through the
   * same key path as the keyboard) or publish a non-text outcome to run state
   * (onRuleState, read back by validators via api.ruleState). The shell passes
   * useCallback-stable handlers so the memo below is not defeated.
   */
  onWidgetText(text: string): void;
  onRuleState(id: string, value: unknown): void;
  /**
   * The engine version counter. Not read directly — it is a memo re-render signal:
   * it bumps on every cells/rules/act change, so the memoized list re-validates
   * when engine state moves but skips the pure 250ms HUD heartbeat.
   */
  version: number;
  /**
   * A >=1Hz counter (also not read directly). Some rules flip purely from elapsed
   * time — a coupled rule going red, the current-time clock — without bumping
   * version; this signal re-validates the rows at least once a second so those
   * flips stay on screen even with zero other engine activity.
   */
  validationTick: number;
}

/** The widget-output handlers, forwarded down to interactive payload renderers. */
type WidgetChannel = Pick<RuleListProps, "onWidgetText" | "onRuleState">;

interface Evaluated {
  rule: Pg2Rule;
  badge: number; // 1-based authored position
  result: ValidationResult;
}

// --- narrow payload readers (payload is Record<string, unknown>) -------------

function readStringArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;
}
function readString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// --- payload renderers -------------------------------------------------------

/**
 * Distinct fake-brand wordmark, each a text-on-tile lockup with its own type
 * treatment so the three sponsors read as three different companies. No emoji,
 * no external assets — pure inline SVG text.
 */
function SponsorTile({ name }: { name: string }) {
  const common = { width: "100%", height: 44, viewBox: "0 0 132 44" } as const;
  switch (name) {
    case "Bloatware Pro":
      return (
        <svg {...common} aria-label={name} role="img">
          <text
            x="8"
            y="28"
            fontFamily="Arial Black, sans-serif"
            fontWeight="900"
            fontSize="15"
            fill="#0f172a"
          >
            Bloat
          </text>
          <rect x="66" y="13" width="58" height="20" rx="3" fill="#0f172a" />
          <text
            x="71"
            y="27"
            fontFamily="Arial Black, sans-serif"
            fontWeight="900"
            fontSize="12"
            fill="#fff"
          >
            WARE
          </text>
        </svg>
      );
    case "Cloudz":
      return (
        <svg {...common} aria-label={name} role="img">
          <defs>
            <linearGradient id="pg2-cloudz" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#38bdf8" />
              <stop offset="1" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <text
            x="66"
            y="29"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontStyle="italic"
            fontWeight="700"
            fontSize="22"
            fill="url(#pg2-cloudz)"
          >
            cloudz
          </text>
        </svg>
      );
    case "YoloVPN":
      return (
        <svg {...common} aria-label={name} role="img">
          <text
            x="66"
            y="28"
            textAnchor="middle"
            fontFamily="ui-monospace, Consolas, monospace"
            fontWeight="700"
            fontSize="16"
            letterSpacing="2"
            fill="#059669"
          >
            YOLO·VPN
          </text>
        </svg>
      );
    case "Grindstone":
      return (
        <svg {...common} aria-label={name} role="img">
          <text
            x="66"
            y="27"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="600"
            fontSize="13"
            letterSpacing="3"
            fill="#1e293b"
          >
            GRINDSTONE
          </text>
        </svg>
      );
    case "SynergyOS":
      return (
        <svg {...common} aria-label={name} role="img">
          <text
            x="14"
            y="28"
            fontFamily="'Segoe UI', system-ui, sans-serif"
            fontWeight="300"
            fontSize="18"
            fill="#0d9488"
          >
            synergy
          </text>
          <text
            x="102"
            y="20"
            fontFamily="'Segoe UI', system-ui, sans-serif"
            fontWeight="700"
            fontSize="11"
            fill="#0f766e"
          >
            OS
          </text>
        </svg>
      );
    default:
      return (
        <svg {...common} aria-label={name} role="img">
          <text
            x="66"
            y="28"
            textAnchor="middle"
            fontFamily="system-ui, sans-serif"
            fontWeight="700"
            fontSize="14"
            fill="#0f172a"
          >
            {name}
          </text>
        </svg>
      );
  }
}

function SponsorTiles({ sponsors }: { sponsors: string[] }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {sponsors.map((s) => (
        <div key={s} className="pg2-sponsor">
          <SponsorTile name={s} />
        </div>
      ))}
    </div>
  );
}

/** No flag artwork exists in the data module; render a flag-shaped name card. */
function CountryFlag({ country }: { country: string | null }) {
  if (country === null) {
    return <p className="mt-2 text-xs text-[color:var(--pg2-legal)]">(feed offline — freebie)</p>;
  }
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="pg2-flag" aria-hidden="true">
        <div className="pg2-flag__band" style={{ background: "#1d4ed8" }} />
        <div className="pg2-flag__band" style={{ background: "#f8fafc" }} />
        <div className="pg2-flag__band" style={{ background: "#dc2626" }} />
      </div>
      <span className="text-sm font-semibold text-[color:var(--pg2-ink)]">{country}</span>
    </div>
  );
}

const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Algebraic square for a grid cell: row 0 is rank 8, col 0 is file a. */
function squareAt(row: number, col: number): string {
  return `${CHESS_FILES[col] ?? "?"}${8 - row}`;
}

/**
 * The chess payload's board is 8 rows of 8 Unicode piece glyphs or '.'. When the
 * payload also carries a `fen` (the live feed and the static pool both supply one)
 * the grid is PLAYABLE: click a side-to-move piece to light its legal targets, then
 * click a target to type that move's SAN into the password through the widget
 * channel. Without a fen — a stale cached feed shape from before fen was served —
 * it degrades to the static diagram it has always been.
 *
 * chess.js is re-instantiated from the fen for every interaction: cheap, and it
 * keeps the component stateless between renders apart from the current selection, so
 * every move starts from the puzzle position again. Validation stays `includes(best
 * move)`, so any legal move types text — a wrong one is simply backspaced and retried
 * against the reset board. Square clicks stopPropagation so they never toggle the
 * rule card, and the squares are `[role=button]`, which the shell's global keydown
 * handler already ignores, so playing here never leaks keystrokes into the password.
 */
function ChessBoard({
  board,
  hint,
  fen,
  widget,
}: {
  board: string[];
  hint?: string;
  fen?: string;
  widget: WidgetChannel;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);
  const interactive = typeof fen === "string" && fen.length > 0;

  // Legal destinations for the current selection, resolved fresh from the fen.
  const targets = new Set<string>();
  if (interactive && selected) {
    try {
      for (const m of new Chess(fen).moves({ square: selected as Square, verbose: true })) {
        targets.add(m.to);
      }
    } catch {
      // silent-ok: an unexpected square just yields no targets.
    }
  }

  function onSquare(row: number, col: number) {
    if (!interactive) return;
    const sq = squareAt(row, col);
    // 1) A click onto a lit target completes the move: type its SAN, reset the board.
    if (selected && targets.has(sq)) {
      try {
        // Promotions always pick a queen: the widget cannot produce an
        // underpromotion SAN (e8=N#), so those rare dailies must be typed by
        // hand — validate is a plain string check either way.
        const move = new Chess(fen).move({
          from: selected as Square,
          to: sq as Square,
          promotion: "q",
        });
        if (move) widget.onWidgetText(move.san);
      } catch {
        // silent-ok: an illegal move (should not happen — sq came from moves()) types nothing.
      }
      setSelected(null);
      setShake(null);
      return;
    }
    // 2) Selecting one of the side-to-move's own pieces lights its targets.
    try {
      const chess = new Chess(fen);
      const piece = chess.get(sq as Square);
      if (piece && piece.color === chess.turn()) {
        setSelected(sq);
        setShake(null);
        return;
      }
    } catch {
      // silent-ok
    }
    // 3) An empty square or an opponent piece is a dead click: shake, type nothing.
    setSelected(null);
    setShake(sq);
  }

  return (
    <div className="mt-3">
      <div
        className="pg2-chess"
        aria-label={interactive ? "Playable chess position" : "Chess position"}
        role={interactive ? "group" : "img"}
      >
        {board.flatMap((row, r) =>
          [...row].slice(0, 8).map((cell, c) => {
            const glyph = cell === "." ? "" : cell;
            const shade = (r + c) % 2 === 0 ? "pg2-chess__sq--light" : "pg2-chess__sq--dark";
            if (!interactive) {
              return (
                <div key={`${r}-${c}`} className={`pg2-chess__sq ${shade}`}>
                  {glyph}
                </div>
              );
            }
            const square = squareAt(r, c);
            const isSelected = selected === square;
            const isTarget = targets.has(square);
            const isShake = shake === square;
            return (
              <div
                key={`${r}-${c}`}
                role="button"
                tabIndex={0}
                aria-label={glyph ? `${square} ${glyph}` : square}
                aria-pressed={isSelected}
                data-square={square}
                data-selected={isSelected ? "true" : undefined}
                data-target={isTarget ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSquare(r, c);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSquare(r, c);
                  }
                }}
                className={`pg2-chess__sq pg2-chess__sq--btn ${shade} ${isSelected ? "pg2-chess__sq--selected" : ""} ${isTarget ? "pg2-chess__sq--target" : ""} ${isShake ? "pg2-chess__sq--shake" : ""}`}
              >
                {glyph}
              </div>
            );
          }),
        )}
      </div>
      {hint ? <p className="mt-2 text-xs text-[color:var(--pg2-muted)]">{hint}</p> : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AntidoteChip({ code }: { code: string }) {
  return (
    <div className="mt-3">
      <span className="text-xs text-[color:var(--pg2-muted)]">Antidote sequence</span>
      <div className="mt-1 inline-block rounded-md border border-[color:var(--pg2-line-strong)] bg-[color:var(--pg2-field)] px-3 py-1 font-mono text-lg tracking-[0.3em] text-[color:var(--pg2-ink)]">
        {code}
      </div>
    </div>
  );
}

function PayloadView({ rule, widget }: { rule: Pg2Rule; widget: WidgetChannel }) {
  const p = rule.payload;
  if (!p) return null;

  const sponsors = readStringArray(p.sponsors);
  if (sponsors) return <SponsorTiles sponsors={sponsors} />;

  if ("country" in p) return <CountryFlag country={readString(p.country)} />;

  const board = readStringArray(p.board);
  if (board)
    return (
      <ChessBoard
        board={board}
        hint={readString(p.hint) ?? undefined}
        fen={readString(p.fen) ?? undefined}
        widget={widget}
      />
    );

  const antidote = readString(p.antidote);
  if (antidote) return <AntidoteChip code={antidote} />;

  return null;
}

// --- rule row ----------------------------------------------------------------

function RuleCard({
  ev,
  variant,
  live,
  widget,
}: {
  ev: Evaluated;
  variant: "active" | "pass" | "idle";
  live: string | null;
  widget: WidgetChannel;
}) {
  const [expanded, setExpanded] = useState(false);
  const passed = variant === "pass";
  const open = variant !== "pass" || expanded;

  return (
    <li>
      <button
        type="button"
        onClick={() => passed && setExpanded((x) => !x)}
        aria-expanded={open}
        aria-label={`Rule ${ev.badge}: ${ev.rule.description}${passed ? " (satisfied)" : ""}`}
        className={`pg2-rule w-full px-4 py-3 text-left ${
          variant === "active" ? "pg2-rule--active" : variant === "pass" ? "pg2-rule--pass" : ""
        } ${passed ? "cursor-pointer" : "cursor-default"}`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`pg2-badge ${
              variant === "active"
                ? "pg2-badge--active"
                : passed
                  ? "pg2-badge--pass"
                  : "pg2-badge--idle"
            }`}
          >
            {passed ? <CheckIcon /> : ev.badge}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm ${
                passed ? "text-[color:var(--pg2-muted)]" : "font-medium text-[color:var(--pg2-ink)]"
              }`}
            >
              {ev.rule.description}
            </p>
            {open && !passed && (ev.result.message || live) ? (
              <p className="mt-1 font-mono text-xs text-[color:var(--pg2-body)]">
                {live ?? ev.result.message}
              </p>
            ) : null}
            {open ? <PayloadView rule={ev.rule} widget={widget} /> : null}
          </div>
        </div>
      </button>
    </li>
  );
}

/**
 * Numbered rule cards. The first failing rule is pinned to the top and
 * highlighted; satisfied rules collapse to compact green rows (click to expand).
 * Badge numbers stay tied to authored position, not display order.
 *
 * Memoized on its props (version included) so the 250ms HUD heartbeat does not
 * re-run 17 validations; engine state changes bump version and re-render it.
 */
export const RuleList = memo(function RuleList({
  rules,
  password,
  state,
  api,
  onWidgetText,
  onRuleState,
}: RuleListProps) {
  const widget: WidgetChannel = { onWidgetText, onRuleState };
  const evaluated: Evaluated[] = rules.map((rule, i) => ({
    rule,
    badge: i + 1,
    result: rule.validate(password, state, api),
  }));

  const firstFailing = evaluated.find((e) => !e.result.passed) ?? null;
  const ordered = firstFailing
    ? [firstFailing, ...evaluated.filter((e) => e !== firstFailing)]
    : evaluated;

  return (
    <ol className="flex flex-col gap-2">
      {ordered.map((ev) => {
        const isActive = ev === firstFailing;
        const variant = ev.result.passed ? "pass" : isActive ? "active" : "idle";
        const live = ev.rule.id === "current-time" ? api.nowHHMM() : null;
        return <RuleCard key={ev.rule.id} ev={ev} variant={variant} live={live} widget={widget} />;
      })}
    </ol>
  );
});

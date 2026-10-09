import { Chain, Glyph, glyphColor, glyphKind } from "./glyphs";
import type { FloorFrame, FrameUnit } from "./view-model";
import type { Frame } from "./playback";

const CELL = 10;
const FACING_DEGREES: Record<FrameUnit["facing"], number> = {
  east: 0,
  south: 90,
  west: 180,
  north: 270,
};
/** A unit slides to its new space over this long. */
const MOVE_MS = 180;

function describePlace(floor: FloorFrame, x: number, y: number): string {
  // One-row floors (the whole Narrow Path) read as a position along the corridor, 1-based.
  return floor.height === 1 ? `${x + 1}` : `${x + 1},${y + 1}`;
}

/** The floor as text for assistive technology: where each unit stands and where the stairs are. */
function summarise(label: string, floor: FloorFrame): string {
  const parts = floor.units.map(
    (unit) => `${unit.name} at ${describePlace(floor, unit.x, unit.y)}`,
  );
  parts.push(`stairs at ${describePlace(floor, floor.stairs.x, floor.stairs.y)}`);
  return `${label}: ${parts.join(", ")}`;
}

function Stairs({ x, y }: { x: number; y: number }) {
  return (
    <g
      transform={`translate(${(x + 1) * CELL} ${(y + 1) * CELL})`}
      fill="none"
      stroke="#e2e8f0"
      strokeWidth={0.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.9}
    >
      <path d="M2.5 3.4 L5 1.8 L7.5 3.4" />
      <path d="M2.5 5.6 L5 4 L7.5 5.6" />
      <path d="M2.5 7.8 L5 6.2 L7.5 7.8" />
    </g>
  );
}

function UnitView({ unit }: { unit: FrameUnit }) {
  const kind = glyphKind(unit);
  const ratio = unit.maxHealth > 0 ? Math.max(0, Math.min(1, unit.health / unit.maxHealth)) : 0;
  return (
    <g
      data-unit-id={unit.id}
      style={{
        transform: `translate(${(unit.x + 1) * CELL}px, ${(unit.y + 1) * CELL}px)`,
        transition: `transform ${MOVE_MS}ms ease-out`,
      }}
    >
      <g data-glyph={kind} data-facing={unit.facing} style={{ color: glyphColor(kind) }}>
        <g transform={`rotate(${FACING_DEGREES[unit.facing]} 5 5)`}>
          <Glyph kind={kind} />
        </g>
        {unit.bound ? <Chain /> : null}
      </g>
      {unit.ticking !== null ? (
        <g data-ticking-ring="">
          <circle cx="5" cy="5" r="4.4" fill="none" stroke="#f87171" strokeWidth={0.5}>
            <animate attributeName="r" values="4.1;4.8;4.1" dur="1s" repeatCount="indefinite" />
          </circle>
          <text
            data-ticking=""
            x="8.6"
            y="2.2"
            fontSize="3"
            fill="#fca5a5"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {unit.ticking}
          </text>
        </g>
      ) : null}
      <g>
        <rect x="1" y="9.1" width="8" height="0.7" fill="#1e293b" />
        <rect
          data-health={ratio}
          x="1"
          y="9.1"
          width={8 * ratio}
          height="0.7"
          fill={ratio > 0.5 ? "#4ade80" : ratio > 0.25 ? "#fbbf24" : "#f87171"}
        />
      </g>
    </g>
  );
}

/**
 * One frame of the floor as an SVG: a dashed wall outline, stairs, and a stroked glyph per unit.
 * A unit's position is a CSS transform, so a step slides; units are keyed by their engine id, so
 * the same Sludge is the same element from one event to the next. Games here are exempt from the
 * OS reduced-motion preference (DESIGN.md), so the slide and the bomb's pulse are not gated.
 */
export function FloorView({ frame, label }: { frame: Frame; label: string }) {
  const { floor } = frame;
  const width = (floor.width + 2) * CELL;
  const height = (floor.height + 2) * CELL;
  return (
    <svg
      role="img"
      aria-label={summarise(label, floor)}
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full rounded-lg bg-black/40"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x={CELL - 0.5}
        y={CELL - 0.5}
        width={floor.width * CELL + 1}
        height={floor.height * CELL + 1}
        fill="none"
        stroke="#64748b"
        strokeWidth={0.6}
        strokeDasharray="2 1.4"
      />
      <Stairs x={floor.stairs.x} y={floor.stairs.y} />
      {floor.units.map((unit) => (
        <UnitView key={unit.id} unit={unit} />
      ))}
    </svg>
  );
}

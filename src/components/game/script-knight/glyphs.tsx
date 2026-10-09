import type { FrameUnit } from "./view-model";

// Our own stroked glyphs, drawn in a 10 x 10 cell facing east. FloorView rotates them to the
// unit's facing. No upstream artwork is used: WarriorJS's logo and icons stay with WarriorJS.

export type GlyphKind = "knight" | "sludge" | "thick-sludge" | "archer" | "wizard" | "captive";

const COLORS: Record<GlyphKind, string> = {
  knight: "#4ade80",
  sludge: "#a3e635",
  "thick-sludge": "#84cc16",
  archer: "#fbbf24",
  wizard: "#c084fc",
  captive: "#94a3b8",
};

export function glyphKind(unit: Pick<FrameUnit, "name" | "warrior">): GlyphKind {
  if (unit.warrior) return "knight";
  switch (unit.name) {
    case "Thick Sludge":
      return "thick-sludge";
    case "Archer":
      return "archer";
    case "Wizard":
      return "wizard";
    case "Captive":
      return "captive";
    default:
      return "sludge";
  }
}

export function glyphColor(kind: GlyphKind): string {
  return COLORS[kind];
}

const STROKE = {
  fill: "none",
  strokeWidth: 0.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The body of one glyph; the caller supplies the stroke colour through `currentColor`. */
export function Glyph({ kind }: { kind: GlyphKind }) {
  switch (kind) {
    case "knight":
      return (
        <g {...STROKE} stroke="currentColor">
          <circle cx="4" cy="5" r="2" />
          <path d="M6 2.8 L9 5 L6 7.2 Z" />
          <path d="M2 5 H1.2" />
        </g>
      );
    case "sludge":
      return (
        <g {...STROKE} stroke="currentColor">
          <path d="M1.5 8 Q1.5 2.5 5 2.5 Q8.5 2.5 8.5 8 Z" />
          <circle cx="4" cy="5.5" r="0.3" />
          <circle cx="6" cy="5.5" r="0.3" />
        </g>
      );
    case "thick-sludge":
      return (
        <g {...STROKE} stroke="currentColor">
          <path d="M0.8 8.5 Q0.8 1.8 5 1.8 Q9.2 1.8 9.2 8.5 Z" />
          <path d="M2.8 8.5 Q2.8 4.2 5 4.2 Q7.2 4.2 7.2 8.5" />
          <circle cx="4" cy="6.4" r="0.3" />
          <circle cx="6" cy="6.4" r="0.3" />
        </g>
      );
    case "archer":
      return (
        <g {...STROKE} stroke="currentColor">
          <path d="M3.5 1.5 Q8.5 5 3.5 8.5" />
          <path d="M3.5 1.5 V8.5" />
          <path d="M1 5 H9 M7.4 3.6 L9 5 L7.4 6.4" />
        </g>
      );
    case "wizard":
      return (
        <g {...STROKE} stroke="currentColor">
          <path d="M5 0.8 L8 8 H2 Z" />
          <path d="M1 8 H9" />
          <path d="M5 3.8 V5.4 M4.2 4.6 H5.8" />
        </g>
      );
    case "captive":
      return (
        <g {...STROKE} stroke="currentColor">
          <circle cx="5" cy="3" r="1.4" />
          <path d="M5 4.4 V7.2 M3.4 5.6 H6.6 M5 7.2 L3.8 9 M5 7.2 L6.2 9" />
        </g>
      );
  }
}

/** Dashed links drawn around a bound unit. */
export function Chain() {
  return (
    <g data-chain="" fill="none" stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="0.9 0.7">
      <path d="M1.2 3.6 L8.8 6.4" />
      <path d="M1.2 6.4 L8.8 3.6" />
    </g>
  );
}

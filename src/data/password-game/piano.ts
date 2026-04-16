/**
 * Piano keys for the "name this note" rule. One octave plus middle C. The
 * rule-card renderer draws an SVG keyboard and highlights the selected key.
 *
 * `note`  - accepted answer (lowercase OK on the rule's validator side).
 * `kind`  - "white" | "black". Determines rendering.
 * `order` - visual index in the octave (0..11), C=0, C#=1, ..., B=11.
 */
export interface PianoKey {
  note: string;
  kind: "white" | "black";
  order: number;
  /** Alternate notation the validator accepts (e.g., Db for C#). */
  alt?: string;
}

export const PIANO_KEYS: readonly PianoKey[] = Object.freeze([
  { note: "C",  kind: "white", order: 0 },
  { note: "C#", kind: "black", order: 1, alt: "Db" },
  { note: "D",  kind: "white", order: 2 },
  { note: "D#", kind: "black", order: 3, alt: "Eb" },
  { note: "E",  kind: "white", order: 4 },
  { note: "F",  kind: "white", order: 5 },
  { note: "F#", kind: "black", order: 6, alt: "Gb" },
  { note: "G",  kind: "white", order: 7 },
  { note: "G#", kind: "black", order: 8, alt: "Ab" },
  { note: "A",  kind: "white", order: 9 },
  { note: "A#", kind: "black", order: 10, alt: "Bb" },
  { note: "B",  kind: "white", order: 11 },
]);

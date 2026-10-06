// The server-rendered half of a game's registry entry: search-facing copy, the
// About block and its credits. Server-safe (no component imports) and kept out
// of the client bundle; every claim must be true of the game's current code.

export interface GameControl {
  /** e.g. "Mouse or touch" */
  input: string;
  /** e.g. "Steer the ship" */
  action: string;
}

export interface GameFact {
  label: string;
  value: string;
}

export interface GameFaq {
  question: string;
  /** Plain text: rendered on the page and emitted verbatim as the FAQPage answer. */
  answer: string;
}

export interface GameCredit {
  label: string;
  detail: string;
  /** Absolute https URL; the detail text becomes the link. */
  href?: string;
}

export interface GameContent {
  /** The <title>, before the layout template appends " — Amin Dhouib". Leads with the search term. */
  seoTitle: string;
  /** Meta and social description, 110-160 characters. */
  seoDescription: string;
  /** schema.org genre values. */
  genre: string[];
  playMode: "SinglePlayer" | "MultiPlayer" | "CoOp";
  /** Opening paragraph of the About block. */
  intro: string;
  howToPlay: string[];
  controls: GameControl[];
  strategy: string[];
  facts: GameFact[];
  faq: GameFaq[];
  credits: GameCredit[];
}

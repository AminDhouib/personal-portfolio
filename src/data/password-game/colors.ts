export interface NamedColor {
  name: string;
  hex: string;
}

export const NAMED_COLORS: readonly NamedColor[] = Object.freeze([
  { name: "crimson", hex: "#DC143C" },
  { name: "salmon", hex: "#FA8072" },
  { name: "tomato", hex: "#FF6347" },
  { name: "orchid", hex: "#DA70D6" },
  { name: "plum", hex: "#DDA0DD" },
  { name: "khaki", hex: "#F0E68C" },
  { name: "lavender", hex: "#E6E6FA" },
  { name: "turquoise", hex: "#40E0D0" },
  { name: "aquamarine", hex: "#7FFFD4" },
  { name: "chartreuse", hex: "#7FFF00" },
  { name: "periwinkle", hex: "#CCCCFF" },
  { name: "mauve", hex: "#E0B0FF" },
  { name: "fuchsia", hex: "#FF00FF" },
  { name: "amber", hex: "#FFBF00" },
  { name: "rose", hex: "#FF007F" },
  { name: "ochre", hex: "#CC7722" },
  { name: "burgundy", hex: "#800020" },
  { name: "emerald", hex: "#50C878" },
  { name: "ruby", hex: "#E0115F" },
  { name: "sapphire", hex: "#0F52BA" },
]);

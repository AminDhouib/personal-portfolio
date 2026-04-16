/**
 * Flags representable as simple CSS gradients (no image assets).
 * Each flag is either a horizontal or vertical tricolor, defined by:
 *   - orientation: 'h' horizontal | 'v' vertical
 *   - colors: three hex values in stripe order (top→bottom or left→right)
 *
 * The rule's UI renders this as a small div with a linear-gradient background.
 */
export interface FlagDef {
  country: string;
  orientation: "h" | "v";
  colors: readonly [string, string, string];
}

export const FLAGS: readonly FlagDef[] = Object.freeze([
  // Horizontal tricolors
  { country: "Germany",     orientation: "h", colors: ["#000000", "#DD0000", "#FFCE00"] },
  { country: "Netherlands", orientation: "h", colors: ["#AE1C28", "#FFFFFF", "#21468B"] },
  { country: "Russia",      orientation: "h", colors: ["#FFFFFF", "#0039A6", "#D52B1E"] },
  { country: "Hungary",     orientation: "h", colors: ["#CD2A3E", "#FFFFFF", "#436F4D"] },
  { country: "Bulgaria",    orientation: "h", colors: ["#FFFFFF", "#00966E", "#D62612"] },
  { country: "Austria",     orientation: "h", colors: ["#ED2939", "#FFFFFF", "#ED2939"] },

  // Vertical tricolors
  { country: "France",      orientation: "v", colors: ["#0055A4", "#FFFFFF", "#EF4135"] },
  { country: "Italy",       orientation: "v", colors: ["#008C45", "#F4F5F0", "#CD212A"] },
  { country: "Ireland",     orientation: "v", colors: ["#169B62", "#FFFFFF", "#FF883E"] },
  { country: "Belgium",     orientation: "v", colors: ["#000000", "#FAE042", "#ED2939"] },
  { country: "Romania",     orientation: "v", colors: ["#002B7F", "#FCD116", "#CE1126"] },
  { country: "Peru",        orientation: "v", colors: ["#D91023", "#FFFFFF", "#D91023"] },
]);

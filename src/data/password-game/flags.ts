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

  // More horizontal tricolors
  { country: "Lithuania",   orientation: "h", colors: ["#FDB913", "#006A44", "#C1272D"] },
  { country: "Estonia",     orientation: "h", colors: ["#0072CE", "#000000", "#FFFFFF"] },
  { country: "Armenia",     orientation: "h", colors: ["#D90012", "#0033A0", "#F2A800"] },
  { country: "Bolivia",     orientation: "h", colors: ["#D52B1E", "#F9E300", "#007934"] },
  { country: "Gabon",       orientation: "h", colors: ["#009E60", "#FCD116", "#3A75C4"] },
  { country: "Sierra Leone", orientation: "h", colors: ["#1EB53A", "#FFFFFF", "#0072C6"] },

  // Vertical tricolors
  { country: "France",      orientation: "v", colors: ["#0055A4", "#FFFFFF", "#EF4135"] },
  { country: "Italy",       orientation: "v", colors: ["#008C45", "#F4F5F0", "#CD212A"] },
  { country: "Ireland",     orientation: "v", colors: ["#169B62", "#FFFFFF", "#FF883E"] },
  { country: "Belgium",     orientation: "v", colors: ["#000000", "#FAE042", "#ED2939"] },
  { country: "Romania",     orientation: "v", colors: ["#002B7F", "#FCD116", "#CE1126"] },
  { country: "Peru",        orientation: "v", colors: ["#D91023", "#FFFFFF", "#D91023"] },
  { country: "Mali",        orientation: "v", colors: ["#14B53A", "#FCD116", "#CE1126"] },
  { country: "Guinea",      orientation: "v", colors: ["#CE1126", "#FCD116", "#009460"] },
  { country: "Ivory Coast", orientation: "v", colors: ["#F77F00", "#FFFFFF", "#009E60"] },
  { country: "Nigeria",     orientation: "v", colors: ["#008751", "#FFFFFF", "#008751"] },
]);

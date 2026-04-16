/**
 * Small hardcoded adjacency table of well-known countries.
 * Values are human-readable neighbor names. Lowercased during match.
 */
export const COUNTRY_BORDERS: Record<string, readonly string[]> = {
  France: ["Spain", "Belgium", "Germany", "Italy", "Switzerland", "Luxembourg", "Monaco", "Andorra"],
  Germany: ["France", "Poland", "Austria", "Switzerland", "Belgium", "Netherlands", "Luxembourg", "Denmark"],
  Spain: ["France", "Portugal", "Andorra"],
  Italy: ["France", "Switzerland", "Austria", "Slovenia"],
  Poland: ["Germany", "Slovakia", "Ukraine", "Belarus", "Lithuania", "Russia"],
  Netherlands: ["Germany", "Belgium"],
  Norway: ["Sweden", "Finland", "Russia"],
  Sweden: ["Norway", "Finland"],
  Brazil: ["Argentina", "Uruguay", "Paraguay", "Bolivia", "Peru", "Colombia", "Venezuela", "Guyana", "Suriname"],
  Argentina: ["Chile", "Bolivia", "Paraguay", "Brazil", "Uruguay"],
  Mexico: ["United States", "Guatemala", "Belize"],
  Colombia: ["Venezuela", "Brazil", "Peru", "Ecuador", "Panama"],
  China: ["Russia", "Mongolia", "India", "Pakistan", "Nepal", "Vietnam", "Laos", "Myanmar", "North Korea", "Kazakhstan", "Bhutan"],
  India: ["Pakistan", "China", "Nepal", "Bhutan", "Bangladesh", "Myanmar"],
  Egypt: ["Libya", "Sudan", "Israel"],
  Kenya: ["Uganda", "Tanzania", "Ethiopia", "Somalia", "South Sudan"],
  Turkey: ["Greece", "Bulgaria", "Georgia", "Armenia", "Iran", "Iraq", "Syria"],
  Russia: ["Finland", "Estonia", "Latvia", "Belarus", "Ukraine", "Georgia", "Kazakhstan", "Mongolia", "China", "North Korea", "Norway", "Lithuania", "Poland"],
  Canada: ["United States"],
  Portugal: ["Spain"],
  Austria: ["Germany", "Czech Republic", "Slovakia", "Hungary", "Slovenia", "Italy", "Switzerland", "Liechtenstein"],
  Switzerland: ["France", "Germany", "Austria", "Italy", "Liechtenstein"],
  Japan: [], // island — filtered out
  Iceland: [], // island — filtered out
};

/** Source countries eligible for the borders rule (must have ≥ 1 neighbor). */
export const BORDER_SOURCES: readonly string[] = Object.entries(COUNTRY_BORDERS)
  .filter(([, neighbors]) => neighbors.length > 0)
  .map(([country]) => country);

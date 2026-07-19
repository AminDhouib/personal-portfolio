export interface CountryCapital {
  country: string;
  capital: string;
}

// Injected from /api/password-game/countries when REST Countries responds.
// The pg2 country-name rule reads this live feed only; when it is unset the
// rule is a freebie (it does not fall back to any static pool).
let _extended: readonly CountryCapital[] | null = null;

export function setExtendedCapitals(list: readonly CountryCapital[] | null): void {
  _extended = list && list.length > 0 ? list : null;
}

/**
 * The raw injected extended list, or null when the live feed is unset. Callers
 * distinguish "feed present" from "feed offline" by the null.
 */
export function getInjectedCapitals(): readonly CountryCapital[] | null {
  return _extended;
}

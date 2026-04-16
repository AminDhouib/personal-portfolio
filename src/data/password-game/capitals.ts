export interface CountryCapital {
  country: string;
  capital: string;
}

export const COUNTRY_CAPITALS: readonly CountryCapital[] = Object.freeze([
  { country: "France", capital: "Paris" },
  { country: "Japan", capital: "Tokyo" },
  { country: "Egypt", capital: "Cairo" },
  { country: "Kenya", capital: "Nairobi" },
  { country: "Peru", capital: "Lima" },
  { country: "Canada", capital: "Ottawa" },
  { country: "Australia", capital: "Canberra" },
  { country: "Thailand", capital: "Bangkok" },
  { country: "Vietnam", capital: "Hanoi" },
  { country: "Greece", capital: "Athens" },
  { country: "Portugal", capital: "Lisbon" },
  { country: "Ireland", capital: "Dublin" },
  { country: "Norway", capital: "Oslo" },
  { country: "Sweden", capital: "Stockholm" },
  { country: "Finland", capital: "Helsinki" },
  { country: "Poland", capital: "Warsaw" },
  { country: "Hungary", capital: "Budapest" },
  { country: "Austria", capital: "Vienna" },
  { country: "Czechia", capital: "Prague" },
  { country: "Denmark", capital: "Copenhagen" },
  { country: "Argentina", capital: "Buenos Aires" },
  { country: "Chile", capital: "Santiago" },
  { country: "Colombia", capital: "Bogota" },
  { country: "Turkey", capital: "Ankara" },
  { country: "Israel", capital: "Jerusalem" },
  { country: "Saudi Arabia", capital: "Riyadh" },
  { country: "South Korea", capital: "Seoul" },
  { country: "Philippines", capital: "Manila" },
  { country: "Indonesia", capital: "Jakarta" },
  { country: "Malaysia", capital: "Kuala Lumpur" },
  { country: "Pakistan", capital: "Islamabad" },
  { country: "Bangladesh", capital: "Dhaka" },
  { country: "Morocco", capital: "Rabat" },
  { country: "Nigeria", capital: "Abuja" },
  { country: "Ethiopia", capital: "Addis Ababa" },
  { country: "Ghana", capital: "Accra" },
  { country: "New Zealand", capital: "Wellington" },
  { country: "Iceland", capital: "Reykjavik" },
  { country: "Croatia", capital: "Zagreb" },
  { country: "Romania", capital: "Bucharest" },
]);

// Injected from /api/password-game/countries when REST Countries responds.
// When present, the capital-city rule picks from this (much larger) list
// instead of the static fallback above.
let _extended: readonly CountryCapital[] | null = null;

export function setExtendedCapitals(list: readonly CountryCapital[] | null): void {
  _extended = list && list.length > 0 ? list : null;
}

export function getCapitals(): readonly CountryCapital[] {
  return _extended ?? COUNTRY_CAPITALS;
}

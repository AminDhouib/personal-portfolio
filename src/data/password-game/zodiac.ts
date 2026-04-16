/**
 * Western zodiac signs with their date ranges and Unicode glyph characters.
 * The glyphs are rendered as TEXT (not emoji) via a `text`-presentation
 * variation selector (`\uFE0E`) to keep them monochromatic and match the
 * game's aesthetic.
 */
export interface ZodiacSign {
  name: string;
  glyph: string;
  /** Month (1-12) and day at which this sign starts. */
  startMonth: number;
  startDay: number;
}

const TEXT_VS = "\uFE0E";

export const ZODIAC_SIGNS: readonly ZodiacSign[] = Object.freeze([
  { name: "Capricorn",   glyph: `\u2651${TEXT_VS}`, startMonth: 12, startDay: 22 },
  { name: "Aquarius",    glyph: `\u2652${TEXT_VS}`, startMonth: 1,  startDay: 20 },
  { name: "Pisces",      glyph: `\u2653${TEXT_VS}`, startMonth: 2,  startDay: 19 },
  { name: "Aries",       glyph: `\u2648${TEXT_VS}`, startMonth: 3,  startDay: 21 },
  { name: "Taurus",      glyph: `\u2649${TEXT_VS}`, startMonth: 4,  startDay: 20 },
  { name: "Gemini",      glyph: `\u264A${TEXT_VS}`, startMonth: 5,  startDay: 21 },
  { name: "Cancer",      glyph: `\u264B${TEXT_VS}`, startMonth: 6,  startDay: 21 },
  { name: "Leo",         glyph: `\u264C${TEXT_VS}`, startMonth: 7,  startDay: 23 },
  { name: "Virgo",       glyph: `\u264D${TEXT_VS}`, startMonth: 8,  startDay: 23 },
  { name: "Libra",       glyph: `\u264E${TEXT_VS}`, startMonth: 9,  startDay: 23 },
  { name: "Scorpio",     glyph: `\u264F${TEXT_VS}`, startMonth: 10, startDay: 23 },
  { name: "Sagittarius", glyph: `\u2650${TEXT_VS}`, startMonth: 11, startDay: 22 },
]);

/** Return the zodiac sign for the given date (defaults to today). */
export function zodiacForDate(date: Date = new Date()): ZodiacSign {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  // Walk through the list and pick whichever start-date this date is past.
  // Capricorn spans year-end so requires two checks.
  for (const sign of ZODIAC_SIGNS) {
    const { startMonth: sm, startDay: sd } = sign;
    const nextIdx = (ZODIAC_SIGNS.indexOf(sign) + 1) % ZODIAC_SIGNS.length;
    const next = ZODIAC_SIGNS[nextIdx];
    const afterStart = m > sm || (m === sm && d >= sd);
    const beforeNext = m < next.startMonth || (m === next.startMonth && d < next.startDay);
    // Capricorn's range wraps across the year boundary.
    if (sign.name === "Capricorn") {
      if ((m === 12 && d >= sd) || (m === 1 && d < next.startDay)) return sign;
      continue;
    }
    if (afterStart && beforeNext) return sign;
  }
  return ZODIAC_SIGNS[0];
}

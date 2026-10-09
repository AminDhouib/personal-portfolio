// Lets a test force every roll the sim makes to one value (a cache hit, a miss,
// a failed load roll) or hand the real streams back. Used from vi.mock("../rng"):
//
//   vi.mock("../rng", async (orig) => (await import("./rng-pin")).withPin(await orig<typeof import("../rng")>()));
//
// The pin is shared state, so each test file resets it in beforeEach/afterEach.
import type * as Rng from "../rng";

export const pin: { value: number | null } = { value: null };

export function withPin(real: typeof Rng): typeof Rng {
  return { ...real, rand: (stream) => pin.value ?? real.rand(stream) };
}

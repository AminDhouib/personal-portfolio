import type { EventDef } from "../types";
import { geraldDef } from "./gerald";
import { campfireDef } from "./campfire";
import { gardenDef } from "./garden";
import { infectionDef } from "./infection";
import { blackHoleDef } from "./black-hole";
import { parasiteDef } from "./parasite";
import { galagaDef } from "./galaga";
import { snakeDef } from "./snake";
import { tetrisDef } from "./tetris";
import { cookieBannerDef } from "./cookie-banner";
import { autocorrectDef } from "./autocorrect";
import { loadingBarDef } from "./loading-bar";

/**
 * Event definition manifest. The engine resolves scheduled instances to their def
 * by id through this list. Each event lives in its own module (Tasks 6-9 replace
 * the stubs with real events, in place); this file is pure aggregation and its
 * shape — ids, families, order — never changes again.
 */
export const EVENT_DEFS: EventDef[] = [
  geraldDef,
  campfireDef,
  gardenDef,
  infectionDef,
  blackHoleDef,
  parasiteDef,
  galagaDef,
  snakeDef,
  tetrisDef,
  cookieBannerDef,
  autocorrectDef,
  loadingBarDef,
];

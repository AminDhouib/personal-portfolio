import type { EventDef } from "../types";

/**
 * Event definition manifest. The engine resolves scheduled instances to their
 * def by id through this list. Task 3 seeds the twelve stub defs and Tasks 6-9
 * replace each with its real event; the manifest's shape never changes again.
 */
export const EVENT_DEFS: EventDef[] = [];

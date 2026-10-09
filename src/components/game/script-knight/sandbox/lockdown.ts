/**
 * Names the player's code must not reach inside the worker: the network, other threads, the
 * channel back to the page, timers and clocks, and the page-identity objects. `Date` is kept
 * (the engine never reads a clock, so it is harmless).
 */
export const REMOVED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "WebTransport",
  "importScripts",
  "indexedDB",
  "caches",
  "BroadcastChannel",
  "Worker",
  "SharedWorker",
  "postMessage",
  "onmessage",
  "addEventListener",
  "removeEventListener",
  "close",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "navigator",
  "location",
  "performance",
  "crypto",
  "reportError",
  "dispatchEvent",
] as const;

/** How many frames a stack keeps (Chrome); the default of 10 can lose the player's line. */
const STACK_TRACE_LIMIT = 50;

/**
 * Remove each listed name from the scope and from every object on its prototype chain (down to,
 * not including, `Object.prototype`). An own, configurable property is deleted; an own,
 * non-configurable but writable data property is set to undefined; anything else cannot be
 * neutralised and is reported as stuck, which the worker treats as "do not run the code".
 * Nothing is frozen: the page re-simulates the run, so a polluted prototype in here changes
 * only what the player's own senses return.
 */
export function lockDown(scope: object): { removed: string[]; stuck: string[] } {
  const removed: string[] = [];
  const stuck: string[] = [];

  for (const name of REMOVED_GLOBALS) {
    let found = false;
    let blocked = false;
    for (
      let target: object | null = scope;
      target !== null && target !== Object.prototype;
      target = Object.getPrototypeOf(target) as object | null
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      if (!descriptor) {
        continue;
      }
      found = true;
      if (descriptor.configurable) {
        delete (target as Record<string, unknown>)[name];
      } else if ("value" in descriptor && descriptor.writable) {
        (target as Record<string, unknown>)[name] = undefined;
      } else {
        blocked = true;
      }
    }
    if (blocked) {
      stuck.push(name);
    } else if (found) {
      removed.push(name);
    }
  }

  if ("stackTraceLimit" in Error) {
    Error.stackTraceLimit = STACK_TRACE_LIMIT;
  }
  return { removed, stuck };
}

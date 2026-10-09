import type { FromWorker } from "./protocol";
import { handleRun } from "./worker-core";

// Worker entry: one fresh worker per run, terminated by the page afterwards. The channel back to
// the page is captured here, at module load, before the player's code exists; lockDown() then
// removes `postMessage` and the listener APIs from the scope, so the closure below is the only
// way to post. (The project types against the DOM lib, where `self` is a Window; inside a
// worker the same calls address the worker scope.)
const post = self.postMessage.bind(self) as (message: FromWorker) => void;

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  handleRun(event.data, post, self);
});

// Tell the page the bundle has loaded, so its player-load deadline starts here and a slow
// download or parse is not counted against the player's code.
post({ type: "booted" });

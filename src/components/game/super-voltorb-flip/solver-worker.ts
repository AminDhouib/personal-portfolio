import { solve, type SolverInput, type SolverResult } from "./solver";

// Worker entry: the exact solver, off the main thread. No DOM, no React, no
// storage; the page posts the clues and gets the result back. (The project
// types against the DOM lib, where `self` is a Window; inside a worker the same
// two calls address the worker scope.)

export type SolveRequest = { id: number; input: SolverInput };
export type SolveResponse = { id: number; result: SolverResult };

self.addEventListener("message", (e: MessageEvent<SolveRequest>) => {
  const response: SolveResponse = { id: e.data.id, result: solve(e.data.input) };
  self.postMessage(response);
});

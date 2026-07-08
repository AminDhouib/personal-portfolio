import "@testing-library/jest-dom";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// reportError is a browser DOM global used by client components to surface
// errors via window.onerror. Stub it in the test environment so it doesn't
// throw ReferenceError.
if (typeof globalThis.reportError !== "function") {
  globalThis.reportError = () => {};
}

// HARD BOUNDARY GUARD (AGENTS.md: tests never touch .data). resolveDataDir()
// falls back to <cwd>/.data when DATA_DIR is unset, so a suite that forgets
// to point DATA_DIR at a temp dir would silently read/write the developer's
// live-mirroring local data. Setting a fresh temp dir here, before any suite
// code runs, makes that fall-through structurally impossible; suites that
// care about the location still override it in their own beforeEach.
process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "test-data-"));

import "@testing-library/jest-dom";

// reportError is a browser DOM global used by client components to surface
// errors via window.onerror. Stub it in the test environment so it doesn't
// throw ReferenceError.
if (typeof globalThis.reportError !== "function") {
  globalThis.reportError = () => {};
}

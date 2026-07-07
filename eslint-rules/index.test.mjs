/**
 * RuleTester suites for the 4 local rules (NF-4): the rules ARE the
 * enforcement layer for the quality gates, so a silent false-negative in one
 * of them would disable a gate invisibly. Every rule gets valid + invalid
 * fixtures, including the environment-split reporter policy that the NF-1
 * regression proved necessary.
 */

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import plugin from "./index.mjs";

const { rules } = plugin;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const SERVER_FILE = "/repo/src/lib/some-server-module.ts";
const CLIENT_FILE = "/repo/src/components/game/some-widget.tsx";

ruleTester.run("no-silent-catch", rules["no-silent-catch"], {
  valid: [
    {
      name: "server catch reporting via captureException",
      filename: SERVER_FILE,
      code: `try { work(); } catch (err) { captureException("scope", err); }`,
    },
    {
      name: "server catch reporting via member expression (Sentry.captureException)",
      filename: SERVER_FILE,
      code: `try { work(); } catch (err) { Sentry.captureException(err); }`,
    },
    {
      name: "server catch using logWarn",
      filename: SERVER_FILE,
      code: `try { work(); } catch (err) { logWarn("scope", "failed", err); }`,
    },
    {
      name: "server catch that rethrows",
      filename: SERVER_FILE,
      code: `try { work(); } catch (err) { throw new Error("wrapped", { cause: err }); }`,
    },
    {
      name: "server catch with silent-ok justification",
      filename: SERVER_FILE,
      code: `try { work(); } catch { /* silent-ok: best-effort cleanup */ }`,
    },
    {
      name: "client module may use reportError",
      filename: CLIENT_FILE,
      code: `"use client";\ntry { work(); } catch (err) { reportError(err); }`,
    },
    {
      name: "injected-reporter shared module (safe-json) may use reportError, Windows path",
      filename: "C:\\repo\\src\\lib\\safe-json.ts",
      code: `try { work(); } catch (err) { if (typeof reportError === "function") reportError(err); }`,
    },
  ],
  invalid: [
    {
      name: "empty server catch",
      filename: SERVER_FILE,
      code: `try { work(); } catch {}`,
      errors: [{ messageId: "silent" }],
    },
    {
      name: "reportError does NOT count in server code (the NF-1 regression)",
      filename: SERVER_FILE,
      code: `try { work(); } catch (err) { if (typeof reportError === "function") reportError(err); }`,
      errors: [{ messageId: "clientOnlyReporter" }],
    },
    {
      name: "console.error alone is not a reporter",
      filename: SERVER_FILE,
      code: `try { work(); } catch (err) { console.error(err); }`,
      errors: [{ messageId: "silent" }],
    },
    {
      name: "client catch with no reporter at all",
      filename: CLIENT_FILE,
      code: `"use client";\ntry { work(); } catch (err) { console.log(err); }`,
      errors: [{ messageId: "silent" }],
    },
  ],
});

ruleTester.run("fetch-requires-signal", rules["fetch-requires-signal"], {
  valid: [
    {
      name: "fetch with signal",
      code: `await fetch(url, { signal: AbortSignal.timeout(8000) });`,
    },
    {
      name: "fetch with quoted signal key",
      code: `await fetch(url, { "signal": controller.signal });`,
    },
    {
      name: "init passed as identifier is not statically checkable",
      code: `await fetch(url, init);`,
    },
    {
      name: "unrelated call named like fetch member",
      code: `cache.prefetch(url);`,
    },
  ],
  invalid: [
    {
      name: "bare fetch",
      code: `await fetch(url);`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "fetch with empty init object",
      code: `await fetch(url, {});`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "fetch with init but no signal",
      code: `await fetch(url, { method: "POST", headers: {} });`,
      errors: [{ messageId: "missing" }],
    },
    {
      name: "window.fetch is still fetch",
      code: `await window.fetch(url);`,
      errors: [{ messageId: "missing" }],
    },
  ],
});

ruleTester.run("require-schema-parse-in-routes", rules["require-schema-parse-in-routes"], {
  valid: [
    {
      name: "request.json validated with safeParse",
      code: `export async function POST(request) { const body = await request.json(); const parsed = schema.safeParse(body); return parsed; }`,
    },
    {
      name: "route with no input read needs no parse",
      code: `export async function GET() { return Response.json({ ok: true }); }`,
    },
    {
      name: "promise .catch is not zod .catch",
      code: `export async function GET() { const data = await fetchData().catch(() => null); return data; }`,
    },
    {
      name: "z.default with a justification comment on the line above",
      code: `const schema = z.object({\n  // default is correct: absent means anonymous visitor\n  name: z.string().default("anon"),\n});`,
    },
  ],
  invalid: [
    {
      name: "request.json read but never zod-parsed",
      code: `export async function POST(request) { const body = await request.json(); return Response.json(body); }`,
      errors: [{ messageId: "noParse" }],
    },
    {
      name: "searchParams read but never zod-parsed",
      code: `export async function GET(request) { const q = request.nextUrl.searchParams.get("q"); return Response.json({ q }); }`,
      errors: [{ messageId: "noParse" }],
    },
    {
      name: "zod .catch silently substitutes defaults (DD1-001 mechanism)",
      code: `const game = z.string().catch("space-shooter");`,
      errors: [{ messageId: "zodCatch" }],
    },
    {
      name: "zod .default without justification",
      code: `const schema = z.object({ name: z.string().default("anon") });`,
      errors: [{ messageId: "defaultJustify" }],
    },
  ],
});

ruleTester.run("no-unknown-in-public-api", rules["no-unknown-in-public-api"], {
  valid: [
    {
      name: "exported function with a real return type",
      code: `export function load(): string { return "x"; }`,
    },
    {
      name: "unknown as a parameter is the sanctioned narrow-me input",
      code: `export function render(detail: unknown): string { return String(detail); }`,
    },
    {
      name: "non-exported function may return unknown",
      code: `function internal(): unknown { return JSON; }`,
    },
    {
      name: "exported type guard is exempt",
      code: `export function isEntry(x: unknown): x is { id: string } { return typeof x === "object" && x !== null; }`,
    },
  ],
  invalid: [
    {
      name: "exported function returning unknown",
      code: `export function load(): unknown { return null; }`,
      errors: [{ messageId: "unknownReturn" }],
    },
    {
      name: "exported alias that IS unknown",
      code: `export type Payload = unknown;`,
      errors: [{ messageId: "unknownAlias" }],
    },
    {
      name: "exported alias containing unknown",
      code: `export type Result = { data: unknown };`,
      errors: [{ messageId: "unknownAlias" }],
    },
  ],
});

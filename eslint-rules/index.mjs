/**
 * Local ESLint rules (Tier 1 of the quality-gates interlude).
 *
 * These encode audit findings as structural, forever-enforced guards:
 *   - no-silent-catch            -> RC-4 swallowed errors, API-route findings
 *   - fetch-requires-signal      -> RC-9 / RC-10 unbounded outbound calls
 *   - require-schema-parse-in-routes -> DD1-001 unvalidated route input / silent defaults
 *   - no-unknown-in-public-api   -> "no lazy unknown" half of the strictness contract
 *
 * Written for eslint 9 flat config + @typescript-eslint/parser (ESTree + TS nodes).
 */

/** Walk a member/call chain down to its left-most identifier name (e.g. `z.object().catch` -> "z"). */
function leftmostIdentifier(node) {
  let cur = node;
  while (cur) {
    if (cur.type === "Identifier") return cur.name;
    if (cur.type === "MemberExpression") cur = cur.object;
    else if (cur.type === "CallExpression") cur = cur.callee;
    else if (cur.type === "TSNonNullExpression") cur = cur.expression;
    else return null;
  }
  return null;
}

/** Depth-first walk of an AST subtree, invoking `visit(node)`; return `true` from visit to stop. */
function walk(root, visit, { skipNestedFunctions = false } = {}) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n.type !== "string") continue;
    if (visit(n)) return true;
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const val = n[key];
      const children = Array.isArray(val) ? val : [val];
      for (const c of children) {
        if (!c || typeof c.type !== "string") continue;
        if (
          skipNestedFunctions &&
          (c.type === "FunctionDeclaration" ||
            c.type === "FunctionExpression" ||
            c.type === "ArrowFunctionExpression")
        ) {
          continue;
        }
        stack.push(c);
      }
    }
  }
  return false;
}

/** True if any TSUnknownKeyword appears in the type subtree (type-param defaults excluded by caller). */
function containsUnknown(typeNode) {
  if (!typeNode) return false;
  return walk(typeNode, (n) => n.type === "TSUnknownKeyword");
}

// Reporters that reach a tracker on the SERVER (console + Sentry + PostHog via
// @/lib/log). The browser-only `reportError` global is NOT here: Node has the
// global too, but no server SDK listens to it — treating it as a valid server
// reporter is exactly what let the NF-1 regression pass this gate.
const SERVER_REPORTERS = new Set(["captureException", "logError", "logWarn"]);
// In `"use client"` modules, `reportError` reaches window.onerror -> Sentry client.
const CLIENT_REPORTERS = new Set([...SERVER_REPORTERS, "reportError"]);
// Shared modules that run in BOTH bundles cannot import @/lib/log (posthog-node
// breaks client builds); they take an injected reporter and default to the
// client path, so `reportError` is accepted here. Keep this list to modules
// whose server entry point injects captureException (see safe-json-server.ts).
const INJECTED_REPORTER_FILES = ["src/lib/safe-json.ts"];

/** Client component/module per Next.js semantics: leading `"use client"` directive. */
function isClientModule(sourceCode) {
  const first = sourceCode.ast.body[0];
  return (
    first?.type === "ExpressionStatement" &&
    typeof first.directive === "string" &&
    first.directive === "use client"
  );
}

/** @type {Record<string, import("eslint").Rule.RuleModule>} */
const rules = {
  "no-silent-catch": {
    meta: {
      type: "problem",
      docs: {
        description:
          'every catch must rethrow, call a reporter approved for its environment (server: captureException/logError/logWarn; client `"use client"` modules may also use reportError), or carry a `// silent-ok: <reason>` comment',
      },
      schema: [],
      messages: {
        silent:
          "Catch swallows the error. Rethrow, call an approved reporter (server: captureException / logError / logWarn; client modules may also use reportError), or add `// silent-ok: <reason>` inside the block.",
        clientOnlyReporter:
          "`reportError` only reaches a tracker in the browser (window.onerror -> Sentry client); in server code it vanishes (NF-1). Use captureException / logError / logWarn here.",
      },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode();
      const filename = context.filename.replace(/\\/g, "/");
      const clientContext =
        isClientModule(sourceCode) || INJECTED_REPORTER_FILES.some((f) => filename.endsWith(f));
      const approved = clientContext ? CLIENT_REPORTERS : SERVER_REPORTERS;
      return {
        CatchClause(node) {
          const block = node.body;
          // 1) explicit opt-out comment inside the catch block
          const comments = sourceCode.getCommentsInside(block);
          if (comments.some((c) => /\bsilent-ok\b/i.test(c.value))) return;
          // 2) rethrow or approved reporter anywhere in the block
          let sawClientOnlyReporter = false;
          const handled = walk(block, (n) => {
            if (n.type === "ThrowStatement") return true;
            if (n.type === "CallExpression") {
              const callee = n.callee;
              const name =
                callee.type === "Identifier"
                  ? callee.name
                  : callee.type === "MemberExpression" && callee.property.type === "Identifier"
                    ? callee.property.name
                    : null;
              if (name !== null) {
                if (approved.has(name)) return true;
                if (name === "reportError") sawClientOnlyReporter = true;
              }
            }
            return false;
          });
          if (!handled) {
            context.report({
              node,
              messageId: sawClientOnlyReporter ? "clientOnlyReporter" : "silent",
            });
          }
        },
      };
    },
  },

  "fetch-requires-signal": {
    meta: {
      type: "problem",
      docs: {
        description:
          "every fetch() must pass an AbortSignal in its init object so the request is bounded",
      },
      schema: [],
      messages: {
        missing:
          "fetch() without a `signal`. Pass `signal: AbortSignal.timeout(ms)` (or a composed signal) so the request cannot hang forever.",
      },
    },
    create(context) {
      function isFetch(callee) {
        if (callee.type === "Identifier") return callee.name === "fetch";
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "fetch"
        ) {
          // window.fetch / globalThis.fetch
          return true;
        }
        return false;
      }
      return {
        CallExpression(node) {
          if (!isFetch(node.callee)) return;
          const init = node.arguments[1];
          // No init object at all -> definitely no signal.
          if (!init) {
            context.report({ node, messageId: "missing" });
            return;
          }
          // Only verify statically-visible object literals; a spread/variable
          // init may carry a signal we can't see, so stay silent there.
          if (init.type !== "ObjectExpression") return;
          const hasSignal = init.properties.some(
            (p) =>
              p.type === "Property" &&
              !p.computed &&
              ((p.key.type === "Identifier" && p.key.name === "signal") ||
                (p.key.type === "Literal" && p.key.value === "signal")),
          );
          if (!hasSignal) context.report({ node: init, messageId: "missing" });
        },
      };
    },
  },

  "require-schema-parse-in-routes": {
    meta: {
      type: "problem",
      docs: {
        description:
          "API route handlers that read request input must validate it with a zod parse; ban z.catch; justify z.default",
      },
      schema: [],
      messages: {
        noParse:
          "This route reads request input ({{source}}) but never calls a zod .parse/.safeParse. Validate the input with a schema.",
        zodCatch:
          "zod `.catch()` silently substitutes a default on invalid input (the DD1-001 mechanism). Use .parse/.safeParse and handle the error explicitly.",
        defaultJustify:
          "zod `.default()` hides a fallback value. Add a comment on the line above explaining why the default is correct.",
      },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode();
      let inputReadNode = null;
      let inputReadSource = "";
      let sawParse = false;

      function noteInputRead(node, source) {
        if (!inputReadNode) {
          inputReadNode = node;
          inputReadSource = source;
        }
      }

      return {
        // request.json() / request.text() / request.formData()
        "CallExpression > MemberExpression.callee"(node) {
          if (node.property.type !== "Identifier") return;
          const name = node.property.name;
          if (name === "json" || name === "text" || name === "formData") {
            const obj = node.object;
            if (obj.type === "Identifier" && /^(request|req)$/.test(obj.name)) {
              noteInputRead(node, `request.${name}()`);
            }
          }
          if (name === "parse" || name === "safeParse") sawParse = true;
        },
        // searchParams / nextUrl.searchParams / params.<x>
        Identifier(node) {
          if (node.name === "searchParams") noteInputRead(node, "searchParams");
        },
        // z.<schema>....catch(...)  and  ....default(...)
        CallExpression(node) {
          const callee = node.callee;
          if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
          const prop = callee.property.name;
          if (prop !== "catch" && prop !== "default") return;
          if (leftmostIdentifier(callee.object) !== "z") return; // zod chains only
          if (prop === "catch") {
            context.report({ node, messageId: "zodCatch" });
            return;
          }
          // prop === "default": require a justification comment on the line above.
          const line = node.loc.start.line;
          const hasComment = sourceCode
            .getAllComments()
            .some((c) => c.loc.end.line === line - 1 || c.loc.end.line === line);
          if (!hasComment) context.report({ node, messageId: "defaultJustify" });
        },
        "Program:exit"() {
          if (inputReadNode && !sawParse) {
            context.report({
              node: inputReadNode,
              messageId: "noParse",
              data: { source: inputReadSource },
            });
          }
        },
      };
    },
  },

  "no-unknown-in-public-api": {
    meta: {
      type: "problem",
      docs: {
        description:
          "`unknown` is banned in exported return types and type aliases (it leaks type-laziness to every caller). Accepting `unknown` as an input and narrowing it is fine — that is strictness working.",
      },
      schema: [],
      messages: {
        unknownReturn:
          "`unknown` return type on an exported function forces every caller to narrow. Return a real type (or a zod-validated one).",
        unknownAlias:
          "`unknown` in an exported type alias is type-laziness. Give it a real shape (or a zod-validated one).",
      },
    },
    create(context) {
      // Only RETURN types and TYPE ALIASES: `unknown` there leaks to callers.
      // `unknown` in a parameter is the sanctioned narrow-me input (logger,
      // caught-error sinks) and is intentionally allowed, mirroring catch vars.
      function checkReturn(fn) {
        if (fn.returnType?.typeAnnotation?.type === "TSTypePredicate") return; // type guard
        if (fn.returnType && containsUnknown(fn.returnType.typeAnnotation)) {
          context.report({ node: fn.returnType, messageId: "unknownReturn" });
        }
      }

      function isExported(node) {
        return (
          node.parent?.type === "ExportNamedDeclaration" ||
          node.parent?.type === "ExportDefaultDeclaration"
        );
      }

      return {
        FunctionDeclaration(node) {
          if (isExported(node)) checkReturn(node);
        },
        TSDeclareFunction(node) {
          if (isExported(node)) checkReturn(node);
        },
        TSTypeAliasDeclaration(node) {
          if (!isExported(node)) return;
          if (containsUnknown(node.typeAnnotation)) {
            context.report({ node, messageId: "unknownAlias" });
          }
        },
      };
    },
  },
};

const plugin = { rules };
export default plugin;

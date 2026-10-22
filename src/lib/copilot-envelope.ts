/**
 * Validates and trims the JSON envelope the chat client POSTs to /api/copilotkit, before the
 * CopilotKit runtime sees it. The route is an open LLM proxy behind an origin check and a rate
 * limit; without this, one request could carry an arbitrarily large conversation (a ~700 KB
 * envelope is ~175k input tokens) and could bring its own tools and system messages, so the
 * client, not the server, would decide what the model is told and allowed to call.
 *
 * What it enforces:
 *   - the envelope's `method` must be one the site's own client sends (the allow-list below);
 *     the runtime also serves a thread store shared by every visitor (resource/request), a
 *     transcription endpoint and others, none of which the chat uses (T-6255);
 *   - a run's `body` must be a plain object: the runtime also accepts it as a JSON string and
 *     parses it later, which would walk past every check here (T-6255);
 *   - message count, total message size, application-context, `state` and `forwardedProps` size
 *     caps (413 over);
 *   - system / developer messages in the client's history are dropped: the grounding prompt is
 *     injected server-side (route.ts, amin-ai-prompt.ts) and is the only system text;
 *   - client tools are dropped unless the site itself registers them (the allow-list below) and the
 *     definition is about as big as the real one.
 *
 * The envelope is the single-route shape `{ method, params?, body? }`, where `body` is an AG-UI
 * RunAgentInput (see route.integration.test.ts for the real shapes). Methods that carry no run
 * (info, stop) pass through after the method check, and the rest of the
 * envelope is forwarded as the client sent it.
 *
 * Cap values come from the site's own chat. The client resends the whole history every turn, so a
 * long real conversation is ~15-20 turns of ~200-character questions and answers of up to
 * ~1,500 characters (an estimate from the answer style, not logged data): a few tens of KB. The
 * test fixture of 40 turns (80 messages, ~72 KB of message JSON) is far past what a visitor
 * produces and still passes under every cap, and each cap is a comfortable multiple above that,
 * so none of them trims a conversation a person actually has.
 */

import { safeJsonParse } from "@/lib/safe-json";

/** Hard ceiling on the request body, read as a stream (see read-capped-body.ts). */
// English chat JSON is ~1 byte per character; 512 KiB also holds the message-character cap below
// written in CJK at 3 bytes per character (360 KB) plus tools and context, and stays under the
// ~700 KB abusive envelope this guards against.
export const COPILOT_MAX_BODY_BYTES = 512 * 1024;

/** Messages forwarded after system messages are dropped: 50 turns, vs ~15-20 in a long real chat. */
export const COPILOT_MAX_MESSAGES = 100;

/** Characters of message JSON, summed. 120k is ~30k tokens (Haiku's window is far larger). */
export const COPILOT_MAX_MESSAGE_CHARS = 120_000;

/**
 * Characters of application context (useCopilotReadable). The site sends one short entry, the page
 * path, about 150 characters. The runtime turns context into a system message, so it is capped
 * instead of dropped: 8,000 is more than 50 times the real use.
 */
export const COPILOT_MAX_CONTEXT_CHARS = 8000;

/**
 * `state` is injected into the agent's system prompt by the runtime, so it is the same channel as
 * `context` and gets the same cap. The site keeps no shared agent state: the client sends `{}`.
 */
export const COPILOT_MAX_STATE_CHARS = 8000;

/**
 * `forwardedProps` can only override agent properties the server marks overridable (none are), so
 * the cap is about size alone. The client sends `{}`, or one `toolChoice` (~80 characters) on a
 * suggestions run; 2,000 is 25 times that.
 */
export const COPILOT_MAX_FORWARDED_PROPS_CHARS = 2000;

/**
 * How deeply the envelope may nest. Depth counts objects and arrays only, a scalar leaf adds no
 * level: the envelope is depth 1, its body 2, and so on, so 32 nested objects are allowed and 33
 * are refused. The deepest thing the site's own client sends is the suggestions tool (envelope >
 * body > tools > tool > parameters > properties > suggestions > items > properties > title), 10
 * deep; an assistant tool call (envelope > body > messages > message > toolCalls > call >
 * function) is 7. 32 is more than three times the deepest. It exists because
 * JSON.stringify, which every size measurement below uses, overflows the call stack on a few
 * thousand levels ("[[[...]]]" is a 10 KB body), and the byte cap does not stop that.
 */
export const COPILOT_MAX_DEPTH = 32;

/**
 * The single-route methods the site's own client sends (CopilotKit 1.77, `useSingleEndpoint`):
 *   - `info` when the provider mounts;
 *   - `agent/connect` when CopilotChat mounts (it replays a thread's history; none exists here);
 *   - `agent/run` for each turn and for the suggestions run;
 *   - `agent/stop` from the stop button.
 * Everything else the runtime serves is refused: `resource/request` (the thread list, thread
 * messages and events, and `POST /threads/clear`, all on a store shared by every visitor),
 * `inspector/metadata` (the client sends it only when `info` reports `inspectorMetadata: true`,
 * which only an Intelligence runtime does, so this route's `info` never triggers it), `transcribe`, `agent/suggest` (the stateless suggestions route; the client uses agent/run on a
 * single endpoint), `inspector/learning`, `trajectory/connect` and memories. Exact string match,
 * as the runtime's own router does.
 */
export const COPILOT_ALLOWED_METHODS: ReadonlySet<string> = new Set([
  "info",
  "agent/run",
  "agent/connect",
  "agent/stop",
]);

/** Methods whose `body` is a RunAgentInput: it must be a plain object, and is capped. */
const RUN_METHODS: ReadonlySet<string> = new Set(["agent/run", "agent/connect"]);

/**
 * The client tools the site really registers, as the server's own copies: `collectLead`
 * (use-lead-collector-action.ts) and the `copilotkitSuggest` tool CopilotKit's core attaches to a
 * chat-suggestions run (SUGGEST_TOOL in @copilotkit/core 1.77, verbatim). A tool the client sends
 * under one of these names is replaced by the copy here, not forwarded: its `parameters` is a
 * JSON schema the runtime builds a validator from, and a schema keyword such as `pattern` or
 * `patternProperties` is a regex compiled and run on the model's tool-call arguments, so a
 * client-chosen "^(a+)+$" blocks the event loop; its description is client-written model
 * instructions. Every other tool is dropped. The copies are pinned against what the client sends in
 * copilot-envelope.test.ts, so a CopilotKit upgrade that changes one surfaces there.
 */
export const COPILOT_TOOL_DEFINITIONS: Readonly<Record<string, unknown>> = {
  collectLead: {
    name: "collectLead",
    description:
      "Collect a visitor's name and email when they express interest in hiring or working with Amin. Use this after they decline or can't use the booking link.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The visitor's full name" },
        email: { type: "string", description: "The visitor's email address" },
        note: {
          type: "string",
          description: "Brief note about what they're looking for (optional)",
        },
      },
      required: ["name", "email"],
    },
  },
  copilotkitSuggest: {
    name: "copilotkitSuggest",
    description: "Suggest what the user could say next",
    parameters: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          description: "List of suggestions shown to the user as buttons.",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description:
                  "The title of the suggestion. This is shown as a button and should be short.",
              },
              message: {
                type: "string",
                description:
                  "The message to send when the suggestion is clicked. This should be a clear, complete sentence and will be sent as an instruction to the AI.",
              },
            },
            required: ["title", "message"],
          },
        },
      },
      required: ["suggestions"],
    },
  },
};

const SERVER_ONLY_ROLES = new Set(["system", "developer"]);

export type EnvelopeResult =
  | {
      ok: true;
      /** The envelope to forward, serialised. */
      body: string;
      /** Names (or "?") of client tools that were removed. */
      droppedTools: string[];
      droppedSystemMessages: number;
    }
  | { ok: false; status: 400 | 413; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isServerOnlyRole(message: unknown): boolean {
  return (
    isRecord(message) &&
    typeof message.role === "string" &&
    SERVER_ONLY_ROLES.has(message.role.trim().toLowerCase())
  );
}

function serializedLength(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

function toolName(tool: unknown): string | null {
  return isRecord(tool) && typeof tool.name === "string" ? tool.name : null;
}

/**
 * Walks the parsed envelope once, before anything is serialised, and names the first thing wrong:
 * an object with an own key named "__proto__" at any depth, or nesting deeper than
 * COPILOT_MAX_DEPTH. JSON.parse keeps a "__proto__" key as an ordinary own property (however it was
 * spelled, including with unicode escapes, which is why this walks the parsed value and never the
 * text), JSON.stringify writes it back out, and the runtime's schema parse of the forwarded copy
 * then makes it the prototype of the object it validates, so a field the body did not carry itself
 * (resume, state, forwardedProps) is read from it and never passed through the checks below. The
 * walk uses an explicit stack, not recursion, so that no body the 512 KiB cap admits can overflow
 * the call stack here; the depth bound is what keeps the later stringify calls safe too.
 */
function findForbidden(root: unknown): "proto" | "deep" | null {
  const stack: Array<[unknown, number]> = [[root, 1]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop() as [unknown, number];
    if (typeof value !== "object" || value === null) continue;
    if (depth > COPILOT_MAX_DEPTH) return "deep";
    if (Array.isArray(value)) {
      for (const item of value) stack.push([item, depth + 1]);
      continue;
    }
    for (const key of Object.keys(value)) {
      if (key === "__proto__") return "proto";
      stack.push([(value as Record<string, unknown>)[key], depth + 1]);
    }
  }
  return null;
}

export function sanitizeCopilotEnvelope(text: string): EnvelopeResult {
  // A body that is not JSON is a client error, answered as the 400 below. The no-op reporter keeps
  // it out of console.error / reportError / PostHog: one bad request must not be one $exception.
  const envelope = safeJsonParse<unknown>(text, "copilotkit:envelope", null, () => undefined);
  if (!isRecord(envelope)) return { ok: false, status: 400, error: "invalid json" };
  const forbidden = findForbidden(envelope);
  if (forbidden === "proto") return { ok: false, status: 400, error: "unsupported field" };
  if (forbidden === "deep") return { ok: false, status: 400, error: "nested too deeply" };

  // Backstop: the route calls this outside any try/catch, so a throw from the size measurements
  // (a stack overflow in JSON.stringify, were the depth bound ever bypassed) would be an unhandled
  // 500 and a Sentry event per request. Any such throw is a client error here.
  try {
    return sanitizeParsed(envelope);
  } catch {
    // silent-ok: only client-shaped input can make the measurements throw, and a bad request must not be one $exception
    return { ok: false, status: 400, error: "invalid body" };
  }
}

function sanitizeParsed(envelope: Record<string, unknown>): EnvelopeResult {
  const { method } = envelope;
  if (typeof method !== "string" || !COPILOT_ALLOWED_METHODS.has(method)) {
    return { ok: false, status: 400, error: "unsupported method" };
  }

  const droppedTools: string[] = [];
  let droppedSystemMessages = 0;
  const run = envelope.body;

  // A body that is not a plain object is refused outright rather than passed through: the runtime
  // would parse a JSON string body itself, after this function has looked at nothing.
  const carriesRun = RUN_METHODS.has(method);
  if ((carriesRun || run !== undefined) && !isRecord(run)) {
    return { ok: false, status: 400, error: "invalid body" };
  }

  if (carriesRun && isRecord(run)) {
    if (Array.isArray(run.messages)) {
      const kept = run.messages.filter((message) => !isServerOnlyRole(message));
      droppedSystemMessages = run.messages.length - kept.length;
      if (kept.length > COPILOT_MAX_MESSAGES) {
        return { ok: false, status: 413, error: "conversation too long" };
      }
      const chars = kept.reduce((sum: number, message) => sum + serializedLength(message), 0);
      if (chars > COPILOT_MAX_MESSAGE_CHARS) {
        return { ok: false, status: 413, error: "conversation too long" };
      }
      run.messages = kept;
    }

    if (serializedLength(run.context) > COPILOT_MAX_CONTEXT_CHARS) {
      return { ok: false, status: 413, error: "context too large" };
    }

    // `resume` carries resolved interrupts into the model prompt and nothing else bounds it. It
    // belongs to CopilotKit's interrupt flow, which the site does not use (collectLead is a plain
    // handler), so it is refused rather than capped or stripped: a client that sends one is not our
    // client.
    if ("resume" in run) return { ok: false, status: 400, error: "unsupported field" };

    if (serializedLength(run.state) > COPILOT_MAX_STATE_CHARS) {
      return { ok: false, status: 413, error: "state too large" };
    }

    if (serializedLength(run.forwardedProps) > COPILOT_MAX_FORWARDED_PROPS_CHARS) {
      return { ok: false, status: 413, error: "forwardedProps too large" };
    }

    if ("tools" in run) {
      const tools = Array.isArray(run.tools) ? run.tools : [];
      run.tools = tools.flatMap((tool) => {
        const name = toolName(tool);
        const own = name !== null && Object.hasOwn(COPILOT_TOOL_DEFINITIONS, name);
        if (!own) droppedTools.push(name ?? "?");
        return own ? [COPILOT_TOOL_DEFINITIONS[name]] : [];
      });
    }
  }

  return {
    ok: true,
    body: JSON.stringify(envelope),
    droppedTools,
    droppedSystemMessages,
  };
}

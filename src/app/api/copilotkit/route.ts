import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { createOpenAI } from "@ai-sdk/openai";
import { NextRequest } from "next/server";
import { guardRequest } from "@/lib/route-guard";
import { tapRunErrors } from "@/lib/copilot-run-error-tap";
import { createDeadlineFetch } from "@/lib/upstream-fetch";
import { safeJsonParseServer } from "@/lib/safe-json-server";
import {
  applySystemPrompt,
  buildAminAiSystemPrompt,
  type ChatCompletionBody,
} from "@/lib/amin-ai-prompt";
import { env } from "@/env";

// RC-10: caps the whole OpenRouter round trip (connect + TTFB + stream) at a
// generous total. Claude Haiku 4.5 answers on this chatbot finish in seconds,
// so 60s is roughly 10-20x headroom and will not cut a legitimate stream; it
// exists so a hung/slow upstream fails fast instead of holding the route (and
// the OpenRouter key) open indefinitely. `maxDuration` is deliberately NOT
// set anywhere in this route: it is a Vercel-only directive and a no-op on
// this self-hosted deployment (the same class of theater env.ts's honesty
// pass already removed elsewhere) -- this in-handler deadline is the real
// enforcement mechanism.
const COPILOT_DEADLINE_MS = 60_000;

// Chat model, served through OpenRouter. Slug verified against the OpenRouter
// models API (https://openrouter.ai/api/v1/models).
const MODEL = "anthropic/claude-haiku-4.5";

// The Amin AI grounding, built once at module load from the typed site data.
// It is the single source of truth for the assistant's facts and is injected
// into the LLM request server-side below (the client `instructions` prop does
// not reach the model on CopilotKit 1.54's AG-UI chat path).
const AMIN_AI_SYSTEM_PROMPT = buildAminAiSystemPrompt();

export const POST = async (req: NextRequest) => {
  // Guard the open LLM proxy before any work: reject cross-origin callers and
  // throttle per client IP so the OpenRouter key can't be drained by abuse.
  // guardRequest reads only headers, never the body -- CopilotKit reads the
  // body itself inside handleRequest below.
  const { response: blocked } = guardRequest(req, {
    key: "copilotkit",
    limit: 20,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  const openrouterKey = env.OPENROUTER_KEY;
  if (!openrouterKey) {
    return new Response(JSON.stringify({ error: "OPENROUTER_KEY not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adapter = new OpenAIAdapter({
    openai: {
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://amindhou.com",
        "X-Title": "Amin Dhouib Portfolio",
      },
    } as never,
    model: MODEL,
  });

  // req.signal is merged in too, so a visitor who closes the chat abandons
  // the upstream call immediately instead of leaving it running to the deadline.
  const deadlineFetch = createDeadlineFetch({ timeoutMs: COPILOT_DEADLINE_MS, signal: req.signal });

  // Ground every outbound OpenRouter chat-completions call with Amin AI's
  // system prompt. CopilotKit 1.54 runs the chat UI on the AG-UI stack, whose
  // run path never forwards the client `instructions` prop to the model, so
  // merging the prompt into the request body here is the one place the
  // grounding provably reaches the LLM. This wraps -- and never replaces -- the
  // RC-10 deadline fetch, so its abort/deadline semantics are unchanged.
  const groundedFetch: typeof fetch = (input, init) => {
    if (init && typeof init.body === "string") {
      const body = safeJsonParseServer<ChatCompletionBody>(init.body, "copilotkit:upstream-body");
      if (body) {
        applySystemPrompt(body, AMIN_AI_SYSTEM_PROMPT);
        return deadlineFetch(input, { ...init, body: JSON.stringify(body) });
      }
    }
    return deadlineFetch(input, init);
  };

  // @ai-sdk/openai v3 defaults to the Responses API which OpenRouter doesn't support.
  // .chat() explicitly selects the Chat Completions endpoint instead.
  const openrouter = createOpenAI({
    apiKey: openrouterKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://amindhou.com",
      "X-Title": "Amin Dhouib Portfolio",
    },
    fetch: groundedFetch,
  });
  adapter.getLanguageModel = () => openrouter.chat(MODEL);

  // Constructed per request, and deliberately NOT hoisted to module scope.
  // CopilotKit 1.54 creates the default agent lazily, once per CopilotRuntime
  // instance, and binds it to the serviceAdapter of whichever request built it
  // first. That adapter closes over this request's `groundedFetch`, which wraps
  // a one-shot `createDeadlineFetch` (a 60s AbortSignal.timeout plus this
  // request's own req.signal). A module-scope runtime therefore pins every
  // later chat run to the FIRST request's already-expired signal: past 60s from
  // the first POST after a deploy, every upstream call is born aborted and the
  // stream fails with RUN_ERROR. Hoisting this line back out as an
  // "optimization" reintroduces exactly that bug.
  const runtime = new CopilotRuntime();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: adapter,
    endpoint: "/api/copilotkit",
  });

  // A failed chat run still answers 200 and reports itself as a RUN_ERROR frame
  // inside the SSE body, so nothing here throws and Sentry would never hear
  // about it. tapRunErrors mirrors the stream and forwards those frames; the
  // response the client gets is unchanged.
  return tapRunErrors(await handleRequest(req));
};

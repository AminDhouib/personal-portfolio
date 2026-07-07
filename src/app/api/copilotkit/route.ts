import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { createOpenAI } from "@ai-sdk/openai";
import { NextRequest } from "next/server";
import { guardRequest } from "@/lib/route-guard";
import { createDeadlineFetch } from "@/lib/upstream-fetch";
import { env } from "@/env";

const runtime = new CopilotRuntime();

// RC-10: caps the whole OpenRouter round trip (connect + TTFB + stream) at a
// generous total. gpt-4o-mini answers on this chatbot finish in seconds, so
// 60s is roughly 10-20x headroom and will not cut a legitimate stream; it
// exists so a hung/slow upstream fails fast instead of holding the route (and
// the OpenRouter key) open indefinitely. `maxDuration` is deliberately NOT
// set anywhere in this route: it is a Vercel-only directive and a no-op on
// this self-hosted deployment (the same class of theater env.ts's honesty
// pass already removed elsewhere) -- this in-handler deadline is the real
// enforcement mechanism.
const COPILOT_DEADLINE_MS = 60_000;

export const POST = async (req: NextRequest) => {
  // Guard the open LLM proxy before any work: reject cross-origin callers and
  // throttle per client IP so the OpenRouter key can't be drained by abuse.
  // guardRequest reads only headers, never the body -- CopilotKit reads the
  // body itself inside handleRequest below.
  const blocked = guardRequest(req, { key: "copilotkit", limit: 20, windowMs: 60_000 });
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
    model: "openai/gpt-4o-mini",
  });

  // @ai-sdk/openai v3 defaults to the Responses API which OpenRouter doesn't support.
  // .chat() explicitly selects the Chat Completions endpoint instead.
  const openrouter = createOpenAI({
    apiKey: openrouterKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://amindhou.com",
      "X-Title": "Amin Dhouib Portfolio",
    },
    // req.signal is merged in too, so a visitor who closes the chat abandons
    // the upstream call immediately instead of leaving it running to the deadline.
    fetch: createDeadlineFetch({ timeoutMs: COPILOT_DEADLINE_MS, signal: req.signal }),
  });
  adapter.getLanguageModel = () => openrouter.chat("openai/gpt-4o-mini");

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: adapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};

import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { createOpenAI } from "@ai-sdk/openai";
import { NextRequest } from "next/server";
import { checkRateLimit, getClientIp, isSameOrigin } from "@/lib/rate-limit";

const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  // Guard the open LLM proxy before any work: reject cross-origin callers and
  // throttle per client IP so the OpenRouter key can't be drained by abuse.
  if (!isSameOrigin(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rate = checkRateLimit(`copilotkit:${getClientIp(req)}`, { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfterSeconds),
      },
    });
  }

  const openrouterKey = process.env.OPENROUTER_KEY;
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
  });
  adapter.getLanguageModel = () => openrouter.chat("openai/gpt-4o-mini");

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: adapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};

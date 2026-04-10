import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";

const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const openrouterKey = process.env.OPENROUTER_KEY;
  if (!openrouterKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_KEY not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new OpenAIAdapter({
      openai: {
        apiKey: openrouterKey,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://amindhou.com",
          "X-Title": "Amin Dhouib Portfolio",
        },
      } as never,
      model: "openai/gpt-4o-mini",
    }),
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};

import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";

const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new OpenAIAdapter({ model: "gpt-4o-mini" }),
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};

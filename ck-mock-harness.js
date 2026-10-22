// Client-only reproduction harness for the chat-open burst. Nothing reaches the server: it replaces
// window.fetch for /api/copilotkit before the page runs. Install with CDP
// Page.addScriptToEvaluateOnNewDocument (and Network.setBlockedURLs ["*api/copilotkit*"] as a
// safety net so a failed override cannot leak a request to prod), then load https://amindhou.com/ or
// a local build, click button[aria-label="Open Amin AI chat"] with el.click(), wait ~8 s and read
// window.__ck. Modes come from localStorage.ckmode, e.g. {"limit":20,"lat":80,"latRun":700}:
// limit = requests allowed per 60 s (the route's own bucket), lat = ms for info/connect,
// latRun = ms for a suggestion run, emptySuggest = suggestion runs return no tool call.
(() => {
  if (window.__ckMock) return;
  window.__ckMock = 1;
  window.__ck = [];
  let cfg = {};
  try {
    cfg = JSON.parse(localStorage.getItem("ckmode") || "{}");
  } catch (e) {}
  window.__limit = cfg.limit || 1e9;
  const lat = cfg.lat == null ? 60 : cfg.lat;
  const latRun = cfg.latRun == null ? lat : cfg.latRun;
  const hits = [];
  const orig = window.fetch.bind(window);
  const sse = (evs) =>
    new Response(evs.map((e) => "data: " + JSON.stringify(e) + "\n\n").join(""), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    if (!/api\/copilotkit/.test(url)) return orig(input, init);
    let env = {};
    try {
      env = JSON.parse((init && init.body) || "{}");
    } catch (e) {}
    const b = env.body || {};
    const tools = (b.tools || []).map((t) => t.name).join(",");
    const rec = { t: Math.round(performance.now()), method: env.method, tools };
    const now = Date.now();
    while (hits.length && hits[0] < now - 60000) hits.shift();
    if (hits.length >= window.__limit) {
      rec.status = 429;
      window.__ck.push(rec);
      return new Response(JSON.stringify({ error: "too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      });
    }
    hits.push(now);
    rec.status = 200;
    window.__ck.push(rec);
    const isSuggest = env.method === "agent/run" && /copilotkitSuggest/.test(tools);
    await new Promise((r) => setTimeout(r, isSuggest ? latRun : lat));
    if (env.method === "info") {
      return new Response(
        JSON.stringify({
          version: "1.77.0",
          agents: { default: { description: "d" } },
          audioFileTranscriptionEnabled: false,
          mode: "sse",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const tid = b.threadId || "t";
    const rid = b.runId || "r";
    if (isSuggest) {
      if (cfg.emptySuggest) {
        return sse([
          { type: "RUN_STARTED", threadId: tid, runId: rid },
          { type: "RUN_FINISHED", threadId: tid, runId: rid },
        ]);
      }
      const id = "tc" + Math.random().toString(36).slice(2, 8);
      return sse([
        { type: "RUN_STARTED", threadId: tid, runId: rid },
        { type: "TOOL_CALL_START", toolCallId: id, toolCallName: "copilotkitSuggest", parentMessageId: "m" + id },
        {
          type: "TOOL_CALL_ARGS",
          toolCallId: id,
          delta: JSON.stringify({
            suggestions: [
              { title: "What has Amin built?", message: "a" },
              { title: "Is Amin available for hire?", message: "b" },
              { title: "How do I book a call with Amin?", message: "c" },
            ],
          }),
        },
        { type: "TOOL_CALL_END", toolCallId: id },
        { type: "RUN_FINISHED", threadId: tid, runId: rid },
      ]);
    }
    if (env.method === "agent/connect") return sse([]);
    return sse([
      { type: "RUN_STARTED", threadId: tid, runId: rid },
      { type: "RUN_FINISHED", threadId: tid, runId: rid },
    ]);
  };
})();

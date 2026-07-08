import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    await getPool().query("SELECT 1");
    dbOk = true;
  } catch {
    // silent-ok: the health check itself should not throw; it reports the
    // db status in the response body for the Docker HEALTHCHECK to act on.
  }

  return NextResponse.json({
    status: dbOk ? "ok" : "degraded",
    uptime: Math.round(process.uptime()),
    checks: { db: dbOk ? "connected" : "unreachable" },
  });
}

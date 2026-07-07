import { NextResponse } from "next/server";
import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cached; must reflect the live process

export async function GET() {
  // Prod mounts the portfolio-data volume at process.cwd()/.data (LEADS_DATA_DIR /
  // LEADERBOARD_DATA_DIR / PG_LEADERBOARD_DIR all default there too when unset). A
  // non-mutating W_OK probe catches a missing or read-only mount -- the silent
  // failure mode that would otherwise lose leads + leaderboard writes.
  const dataDir = path.join(process.cwd(), ".data");
  const dataWritable = await fs.access(dataDir, fsConstants.W_OK).then(
    () => true,
    () => false, // two-arg then, NOT a catch block -- no no-silent-catch trigger
  );

  return NextResponse.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    checks: { data: dataWritable ? "writable" : "unwritable" },
  });
}

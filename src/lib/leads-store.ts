import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { captureException } from "@/lib/log";
import { resolveDataDir } from "@/lib/data-dir";
import { safeJsonParseServer } from "@/lib/safe-json-server";
import {
  leadRecordSchema,
  PERSISTENCE_SCHEMA_VERSION,
  type LeadRecord,
} from "@/lib/persistence-schemas";

/**
 * Append-only JSONL store for collected leads (audit P2-DATA-004: fs moved
 * out of the route into a store module, matching the persistence boundary
 * RC-2). Disk is the record of truth -- the Resend email in the route is
 * best-effort on top.
 */

function leadsFilePath(): string {
  return path.join(resolveDataDir(), "leads.jsonl");
}

export interface LeadInput {
  name: string;
  email: string;
  note: string;
  source: string;
  page: string;
}

/**
 * Stamps identity + provenance (schemaVersion, id, createdAt) and appends one
 * line. Throws on write failure -- the route decides how a persistence
 * failure combines with the email fallback.
 */
export async function appendLead(input: LeadInput): Promise<LeadRecord> {
  const record: LeadRecord = {
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    id: randomUUID(),
    ...input,
    createdAt: new Date().toISOString(),
  };
  await fs.mkdir(resolveDataDir(), { recursive: true });
  await fs.appendFile(leadsFilePath(), JSON.stringify(record) + "\n", "utf-8");
  return record;
}

/**
 * Lenient line-by-line read for the future admin surface and the restore
 * drill: invalid lines are skipped and reported in one batch, never thrown --
 * one bad line must not hide every other lead.
 */
export async function readAllLeads(): Promise<LeadRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(leadsFilePath(), "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    captureException("leads.read", e);
    return [];
  }
  const records: LeadRecord[] = [];
  let dropped = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    // safeJsonParseServer reports the parse failure itself (scope "leads");
    // the batch counter below covers schema-invalid lines.
    const parsed = safeJsonParseServer(line, "leads");
    if (parsed === null) {
      dropped += 1;
      continue;
    }
    const result = leadRecordSchema.safeParse(parsed);
    if (result.success) records.push(result.data);
    else dropped += 1;
  }
  if (dropped > 0) {
    captureException(
      "leads.read",
      new Error(`skipped ${dropped} invalid line(s) in ${leadsFilePath()}`),
    );
  }
  return records;
}

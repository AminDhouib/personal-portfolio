import { getPool } from "@/lib/db";
import { captureException } from "@/lib/log";

export interface LeadInput {
  name: string;
  email: string;
  note: string;
  source: string;
  page: string;
}

export interface LeadRecord {
  id: string;
  name: string;
  email: string;
  note: string;
  source: string;
  page: string;
  createdAt: string;
}

export async function appendLead(input: LeadInput): Promise<LeadRecord> {
  const { rows } = await getPool().query(
    `INSERT INTO leads (name, email, note, source, page)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, note, source, page, created_at AS "createdAt"`,
    [input.name, input.email, input.note, input.source, input.page],
  );
  const row = rows[0] as LeadRecord;
  return { ...row, createdAt: new Date(row.createdAt).toISOString() };
}

export async function readAllLeads(): Promise<LeadRecord[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, email, note, source, page, created_at AS "createdAt"
         FROM leads
        ORDER BY created_at ASC`,
    );
    return rows.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt).toISOString(),
    })) as LeadRecord[];
  } catch (err) {
    captureException("leads.read", err);
    return [];
  }
}

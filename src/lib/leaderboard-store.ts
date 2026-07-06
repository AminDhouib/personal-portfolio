import { promises as fs } from "node:fs";
import path from "node:path";
import { captureException } from "@/lib/log";
import { safeJsonParse } from "@/lib/safe-json";

export interface LeaderboardConfig<T> {
  dataDirEnv?: string;
  fileName: string;
  maxEntries: number;
  returnLimit: number;
  nameMax: number;
  defaultName: string;
  isEntry: (x: unknown) => x is T;
}

export function createLeaderboardStore<T>(config: LeaderboardConfig<T>) {
  const dataDir =
    (config.dataDirEnv && process.env[config.dataDirEnv]) ?? path.join(process.cwd(), ".data");
  const filePath = path.join(dataDir, config.fileName);

  let tmpCounter = 0;
  function nextTmp(): number {
    tmpCounter = (tmpCounter + 1) % 1_000_000;
    return tmpCounter;
  }

  let writeChain: Promise<unknown> = Promise.resolve();
  function withWriteLock<R>(fn: () => Promise<R>): Promise<R> {
    const next = writeChain.then(fn, fn);
    writeChain = next.catch(() => undefined);
    return next;
  }

  async function readAll(): Promise<T[]> {
    try {
      const buf = await fs.readFile(filePath, "utf-8");
      const parsed = safeJsonParse(buf, "leaderboard");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(config.isEntry);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      captureException("leaderboard", e);
      return [];
    }
  }

  async function writeAll(entries: T[]): Promise<void> {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}-${nextTmp()}`;
    await fs.writeFile(tmp, JSON.stringify(entries), "utf-8");
    await fs.rename(tmp, filePath);
  }

  function sanitizeName(raw: unknown): string {
    if (typeof raw !== "string") return config.defaultName;
    const cleaned = raw
      .replace(/[\u0000-\u001f]/g, "")
      .trim()
      .slice(0, config.nameMax);
    return cleaned.length > 0 ? cleaned : config.defaultName;
  }

  return {
    readAll,
    writeAll,
    withWriteLock,
    sanitizeName,
    returnLimit: config.returnLimit,
    maxEntries: config.maxEntries,
  };
}

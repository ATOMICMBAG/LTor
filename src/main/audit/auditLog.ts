import { promises as fs } from "node:fs";
import { existsSync, createReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { AuditCategory, AuditEntry } from "@shared/types";

/**
 * Append-only JSONL audit log.
 * One JSON object per line for tamper-evident, easy diff-able storage.
 */
export class AuditLog {
  private readonly filePath: string;
  private queue: Promise<void> = Promise.resolve();
  private subscribers = new Set<(entry: AuditEntry) => void>();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      await fs.writeFile(this.filePath, "", "utf-8");
    }
    // Boot entry
    await this.append({
      category: "system",
      actor: "system",
      action: "audit_log_opened",
      details: { path: this.filePath },
    });
  }

  subscribe(fn: (entry: AuditEntry) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  async append(input: {
    category: AuditCategory;
    actor: "user" | "system";
    action: string;
    details?: Record<string, unknown>;
  }): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: randomUUID(),
      ts: Date.now(),
      category: input.category,
      actor: input.actor,
      action: input.action,
      details: input.details,
    };
    // Serialize writes
    this.queue = this.queue
      .then(() =>
        fs.appendFile(this.filePath, JSON.stringify(entry) + "\n", "utf-8"),
      )
      .catch((e) => {
        // Last-resort: log to stderr so we don't lose the trace
        console.error("[audit] append failed:", e);
      });
    await this.queue;
    for (const fn of this.subscribers) {
      try {
        fn(entry);
      } catch (e) {
        console.error("[audit] subscriber failed:", e);
      }
    }
    return entry;
  }

  /** Read the last `limit` entries (newest first). */
  async list(limit = 500): Promise<AuditEntry[]> {
    if (!existsSync(this.filePath)) return [];
    return new Promise<AuditEntry[]>((resolve, reject) => {
      const out: AuditEntry[] = [];
      const rl = createInterface({
        input: createReadStream(this.filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });
      rl.on("line", (line) => {
        if (!line.trim()) return;
        try {
          out.push(JSON.parse(line));
        } catch {
          // ignore corrupt lines
        }
      });
      rl.on("close", () => {
        out.sort((a, b) => b.ts - a.ts);
        resolve(out.slice(0, limit));
      });
      rl.on("error", reject);
    });
  }

  async clear(): Promise<void> {
    await fs.writeFile(this.filePath, "", "utf-8");
    await this.append({
      category: "system",
      actor: "user",
      action: "audit_log_cleared",
    });
  }

  static defaultPath(userDataDir: string): string {
    return join(userDataDir, "audit.log.jsonl");
  }
}

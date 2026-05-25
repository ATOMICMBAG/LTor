import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Connection, ConnectionKind } from "@shared/types";

interface PersistShape {
  version: 1;
  connections: Connection[];
}

/**
 * Persists connection profiles (without runtime status) to a JSON file
 * in the userData directory.
 */
export class ConnectionStore {
  private readonly filePath: string;
  private data: PersistShape = { version: 1, connections: [] };

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      await this.persist();
      return;
    }
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.connections)) {
        // Always start in disconnected state.
        this.data = {
          version: 1,
          connections: parsed.connections.map((c) => ({
            ...c,
            status: "disconnected",
            lastError: undefined,
          })),
        };
      }
    } catch (e) {
      console.error("[connections] failed to load store, starting empty:", e);
      this.data = { version: 1, connections: [] };
      await this.persist();
    }
  }

  list(): Connection[] {
    return this.data.connections.map((c) => ({ ...c }));
  }

  get(id: string): Connection | undefined {
    const c = this.data.connections.find((x) => x.id === id);
    return c ? { ...c } : undefined;
  }

  async create(input: {
    name: string;
    kind: ConnectionKind;
    config: Connection["config"];
  }): Promise<Connection> {
    const conn: Connection = {
      id: randomUUID(),
      name: input.name,
      kind: input.kind,
      status: "disconnected",
      createdAt: Date.now(),
      config: input.config,
    };
    this.data.connections.push(conn);
    await this.persist();
    return { ...conn };
  }

  async update(
    id: string,
    patch: Partial<Pick<Connection, "name" | "config">>,
  ): Promise<Connection | undefined> {
    const idx = this.data.connections.findIndex((c) => c.id === id);
    if (idx < 0) return undefined;
    this.data.connections[idx] = {
      ...this.data.connections[idx],
      ...patch,
    };
    await this.persist();
    return { ...this.data.connections[idx] };
  }

  async delete(id: string): Promise<boolean> {
    const before = this.data.connections.length;
    this.data.connections = this.data.connections.filter((c) => c.id !== id);
    if (this.data.connections.length === before) return false;
    await this.persist();
    return true;
  }

  /** In-memory status mutation (not persisted). */
  setStatus(
    id: string,
    status: Connection["status"],
    lastError?: string,
  ): Connection | undefined {
    const c = this.data.connections.find((x) => x.id === id);
    if (!c) return undefined;
    c.status = status;
    c.lastError = lastError;
    return { ...c };
  }

  private async persist(): Promise<void> {
    // Strip volatile fields before persisting
    const sanitized: PersistShape = {
      version: 1,
      connections: this.data.connections.map((c) => ({
        ...c,
        status: "disconnected",
        lastError: undefined,
      })),
    };
    await fs.writeFile(
      this.filePath,
      JSON.stringify(sanitized, null, 2),
      "utf-8",
    );
  }

  static defaultPath(userDataDir: string): string {
    return join(userDataDir, "connections.json");
  }
}

import type {
  AuditEntry,
  Connection,
  ConnectionKind,
  ConnectionStatus,
  SystemInfo,
  TelemetrySample,
  WriteRequest,
} from "@shared/types";

/**
 * Transport-agnostic interface used by the renderer to talk to the backend.
 *
 * Two implementations exist:
 *  - `ElectronTransport` (default in the Electron desktop app), backed by
 *    `window.ltor` exposed by the preload script.
 *  - `WebSocketTransport` (used when the renderer runs in a normal web
 *    browser against a remote Node backend, e.g. on a VPS).
 *
 * Adding a new method here requires adding it to both implementations.
 */
export interface LtorTransport {
  sys: {
    info(): Promise<SystemInfo>;
  };
  audit: {
    list(limit?: number): Promise<AuditEntry[]>;
    append(input: {
      category: AuditEntry["category"];
      actor: AuditEntry["actor"];
      action: string;
      details?: Record<string, unknown>;
    }): Promise<AuditEntry>;
    clear(): Promise<boolean>;
    onEntry(cb: (entry: AuditEntry) => void): () => void;
  };
  connections: {
    list(): Promise<Connection[]>;
    create(input: {
      name: string;
      kind: ConnectionKind;
      config: Connection["config"];
    }): Promise<Connection>;
    update(
      id: string,
      patch: Partial<Pick<Connection, "name" | "config">>,
    ): Promise<Connection | undefined>;
    delete(id: string): Promise<boolean>;
    connect(id: string): Promise<{ ok: boolean; error?: string }>;
    disconnect(id: string): Promise<boolean>;
    write(req: WriteRequest): Promise<{ ok: boolean; error?: string }>;
    onStatus(
      cb: (e: {
        connectionId: string;
        status: ConnectionStatus;
        error?: string;
      }) => void,
    ): () => void;
    onTelemetry(cb: (sample: TelemetrySample) => void): () => void;
  };
  /** Identifies which backend is currently active – useful in StatusBar/Logs. */
  readonly mode: "electron" | "websocket" | "none";
}

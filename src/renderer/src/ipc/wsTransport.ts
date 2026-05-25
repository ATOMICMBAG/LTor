import type {
  AuditEntry,
  Connection,
  ConnectionStatus,
  TelemetrySample,
} from "@shared/types";
import type { LtorTransport } from "./transport";

/**
 * WebSocket-based transport for running the maazi.de|LTor frontend against a remote
 * Node backend (e.g. on a VPS). The wire protocol is intentionally very simple
 * so any backend can implement it:
 *
 *   ─── Request  (client → server) ──────────────────────────────────
 *   { "id": "<uuid>", "method": "<name>", "params": [...] }
 *
 *   ─── Response (server → client) ──────────────────────────────────
 *   { "id": "<uuid>", "ok": true,  "result": ... }
 *   { "id": "<uuid>", "ok": false, "error": "<message>" }
 *
 *   ─── Event    (server → client, unsolicited) ─────────────────────
 *   { "event": "audit",     "payload": <AuditEntry> }
 *   { "event": "status",    "payload": { connectionId, status, error? } }
 *   { "event": "telemetry", "payload": <TelemetrySample> }
 *
 * Supported methods (mirror the Electron preload API):
 *   sys.info
 *   audit.list(limit?), audit.append(input), audit.clear
 *   connections.list, connections.create(input), connections.update(id, patch),
 *   connections.delete(id), connections.connect(id), connections.disconnect(id),
 *   connections.write(req)
 */

type RpcCall = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type StatusListener = (e: {
  connectionId: string;
  status: ConnectionStatus;
  error?: string;
}) => void;

export function createWebSocketTransport(url: string): LtorTransport {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 500;
  const pending = new Map<string, RpcCall>();
  const auditListeners = new Set<(entry: AuditEntry) => void>();
  const statusListeners = new Set<StatusListener>();
  const telemetryListeners = new Set<(sample: TelemetrySample) => void>();

  function newId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function connect(): void {
    try {
      socket = new WebSocket(url);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    socket.addEventListener("open", () => {
      reconnectDelay = 500;
      console.info(`[ltor:ws] connected → ${url}`);
    });
    socket.addEventListener("close", () => {
      console.warn(`[ltor:ws] disconnected from ${url}`);
      // Reject all pending requests so the UI doesn't hang forever.
      for (const [, call] of pending) {
        call.reject(new Error("WebSocket disconnected"));
      }
      pending.clear();
      scheduleReconnect();
    });
    socket.addEventListener("error", (ev) => {
      console.warn("[ltor:ws] error", ev);
    });
    socket.addEventListener("message", (ev) => {
      let data: unknown;
      try {
        data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;
      const msg = data as Record<string, unknown>;
      if (typeof msg["event"] === "string") {
        dispatchEvent(msg["event"] as string, msg["payload"]);
        return;
      }
      if (typeof msg["id"] === "string") {
        const call = pending.get(msg["id"]);
        if (!call) return;
        pending.delete(msg["id"]);
        if (msg["ok"]) {
          call.resolve(msg["result"]);
        } else {
          const errMsg =
            typeof msg["error"] === "string" ?
              msg["error"]
            : "Unknown RPC error";
          call.reject(new Error(errMsg));
        }
      }
    });
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
      connect();
    }, reconnectDelay);
  }

  function dispatchEvent(event: string, payload: unknown): void {
    switch (event) {
      case "audit":
        for (const l of auditListeners) l(payload as AuditEntry);
        break;
      case "status":
        for (const l of statusListeners)
          l(
            payload as {
              connectionId: string;
              status: ConnectionStatus;
              error?: string;
            },
          );
        break;
      case "telemetry":
        for (const l of telemetryListeners) l(payload as TelemetrySample);
        break;
    }
  }

  function rpc<T>(method: string, ...params: unknown[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }
      const id = newId();
      pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  connect();

  return {
    mode: "websocket",
    sys: {
      info: () => rpc("sys.info"),
    },
    audit: {
      list: (limit) => rpc("audit.list", limit),
      append: (input) => rpc("audit.append", input),
      clear: () => rpc("audit.clear"),
      onEntry(cb) {
        auditListeners.add(cb);
        return () => auditListeners.delete(cb);
      },
    },
    connections: {
      list: () => rpc<Connection[]>("connections.list"),
      create: (input) => rpc<Connection>("connections.create", input),
      update: (id, patch) =>
        rpc<Connection | undefined>("connections.update", id, patch),
      delete: (id) => rpc<boolean>("connections.delete", id),
      connect: (id) =>
        rpc<{ ok: boolean; error?: string }>("connections.connect", id),
      disconnect: (id) => rpc<boolean>("connections.disconnect", id),
      write: (req) =>
        rpc<{ ok: boolean; error?: string }>("connections.write", req),
      onStatus(cb) {
        statusListeners.add(cb);
        return () => statusListeners.delete(cb);
      },
      onTelemetry(cb) {
        telemetryListeners.add(cb);
        return () => telemetryListeners.delete(cb);
      },
    },
  };
}

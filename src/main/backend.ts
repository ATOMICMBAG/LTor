import type {
  AuditCategory,
  AuditEntry,
  Connection,
  ConnectionKind,
  ConnectionStatus,
  SimConfig,
  SystemInfo,
  TelemetrySample,
  WriteRequest,
} from "@shared/types";
import { isLaserModelId } from "@shared/laserPhysics";
import type { AuditLog } from "./audit/auditLog";
import type { ConnectionStore } from "./store/connectionStore";
import type { ProtocolManager } from "./protocols/manager";

/**
 * Transport-independent backend: the same handlers serve the Electron IPC
 * (src/main/index.ts) and the WebSocket server (server/index.ts).
 */

export interface BackendPolicy {
  /** Connection kinds that may be created. */
  allowedKinds: ConnectionKind[];
  /** Max. stored connections (undefined = unlimited). */
  maxConnections?: number;
  /** Max. simultaneously connected adapters (undefined = unlimited). */
  maxActive?: number;
  /**
   * Inputs come from anonymous clients (web demo): validate strictly and
   * never trust the client-supplied audit actor.
   */
  untrusted: boolean;
  /** Message shown when a disallowed kind is requested. */
  kindDeniedMessage?: string;
}

export interface BackendDeps {
  store: ConnectionStore;
  audit: AuditLog;
  manager: ProtocolManager;
  sysInfo: () => SystemInfo;
  policy: BackendPolicy;
}

export type BackendEvent =
  | { event: "audit"; payload: AuditEntry }
  | {
      event: "status";
      payload: { connectionId: string; status: ConnectionStatus; error?: string };
    }
  | { event: "telemetry"; payload: TelemetrySample };

const AUDIT_CATEGORIES: AuditCategory[] = [
  "system",
  "connection",
  "telemetry",
  "sensor",
  "user",
  "warning",
  "alarm",
];

function fail(message: string): never {
  throw new Error(message);
}

function checkId(id: unknown): string {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    fail("Ungültige Verbindungs-ID");
  }
  return id;
}

function checkName(name: unknown): string {
  if (typeof name !== "string") fail("Name fehlt");
  const n = name.trim();
  if (n.length === 0 || n.length > 80) fail("Name muss 1–80 Zeichen lang sein");
  return n;
}

export function sanitizeSimConfig(raw: unknown): SimConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (!isLaserModelId(c["model"])) fail("Unbekanntes Lasermodell");
  const out: SimConfig = { model: c["model"] };
  if (c["sampleRateHz"] !== undefined) {
    const r = Number(c["sampleRateHz"]);
    if (!Number.isFinite(r)) fail("sampleRateHz muss eine Zahl sein");
    out.sampleRateHz = Math.min(10, Math.max(1, Math.round(r)));
  }
  if (c["noise"] !== undefined) {
    const n = Number(c["noise"]);
    if (!Number.isFinite(n)) fail("noise muss eine Zahl sein");
    out.noise = Math.min(1, Math.max(0, n));
  }
  return out;
}

export function createBackend(deps: BackendDeps) {
  const { store, audit, manager, policy } = deps;

  function checkKind(kind: unknown): ConnectionKind {
    if (!policy.allowedKinds.includes(kind as ConnectionKind)) {
      fail(policy.kindDeniedMessage ?? `Verbindungstyp "${String(kind)}" nicht erlaubt`);
    }
    return kind as ConnectionKind;
  }

  function checkConfig(kind: ConnectionKind, config: unknown): Connection["config"] {
    if (kind === "sim") return sanitizeSimConfig(config);
    if (policy.untrusted) fail("Konfiguration nicht erlaubt");
    if (!config || typeof config !== "object") fail("Konfiguration fehlt");
    return config as Connection["config"];
  }

  return {
    "sys.info": async (): Promise<SystemInfo> => deps.sysInfo(),

    "audit.list": async (limit?: unknown): Promise<AuditEntry[]> => {
      const n = typeof limit === "number" && Number.isFinite(limit) ? limit : 500;
      return audit.list(Math.min(2000, Math.max(1, Math.round(n))));
    },

    "audit.append": async (input: unknown): Promise<AuditEntry> => {
      const i = (input ?? {}) as Record<string, unknown>;
      const category = i["category"] as AuditCategory;
      if (!AUDIT_CATEGORIES.includes(category)) fail("Ungültige Audit-Kategorie");
      const action = i["action"];
      if (typeof action !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(action)) {
        fail("Ungültige Audit-Aktion");
      }
      const details = i["details"];
      if (details !== undefined) {
        if (typeof details !== "object" || details === null || Array.isArray(details)) {
          fail("Audit-Details müssen ein Objekt sein");
        }
        if (JSON.stringify(details).length > 4096) fail("Audit-Details zu groß");
      }
      const actor =
        policy.untrusted ? "user" : i["actor"] === "system" ? "system" : "user";
      return audit.append({
        category,
        actor,
        action,
        details: details as Record<string, unknown> | undefined,
      });
    },

    "audit.clear": async (): Promise<boolean> => {
      await audit.clear();
      return true;
    },

    "connections.list": async (): Promise<Connection[]> => store.list(),

    "connections.create": async (input: unknown): Promise<Connection> => {
      const i = (input ?? {}) as Record<string, unknown>;
      const name = checkName(i["name"]);
      const kind = checkKind(i["kind"]);
      const config = checkConfig(kind, i["config"]);
      if (policy.maxConnections !== undefined && store.size >= policy.maxConnections) {
        fail(`Maximal ${policy.maxConnections} Verbindungen pro Sitzung`);
      }
      const conn = await store.create({ name, kind, config });
      await audit.append({
        category: "connection",
        actor: "user",
        action: "connection_created",
        details: { id: conn.id, name: conn.name, kind: conn.kind },
      });
      return conn;
    },

    "connections.update": async (
      id: unknown,
      patch: unknown,
    ): Promise<Connection | undefined> => {
      const cid = checkId(id);
      const existing = store.get(cid);
      if (!existing) return undefined;
      const p = (patch ?? {}) as Record<string, unknown>;
      const clean: Partial<Pick<Connection, "name" | "config">> = {};
      if (p["name"] !== undefined) clean.name = checkName(p["name"]);
      if (p["config"] !== undefined) clean.config = checkConfig(existing.kind, p["config"]);
      const updated = await store.update(cid, clean);
      if (updated) {
        await audit.append({
          category: "connection",
          actor: "user",
          action: "connection_updated",
          details: { id: cid, fields: Object.keys(clean) },
        });
      }
      return updated;
    },

    "connections.delete": async (id: unknown): Promise<boolean> => {
      const cid = checkId(id);
      await manager.disconnect(cid).catch(() => undefined);
      const ok = await store.delete(cid);
      if (ok) {
        await audit.append({
          category: "connection",
          actor: "user",
          action: "connection_deleted",
          details: { id: cid },
        });
      }
      return ok;
    },

    "connections.connect": async (
      id: unknown,
    ): Promise<{ ok: boolean; error?: string }> => {
      const cid = checkId(id);
      const conn = store.get(cid);
      if (!conn) fail(`Connection ${cid} not found`);
      if (
        policy.maxActive !== undefined &&
        !manager.isConnected(cid) &&
        manager.activeCount >= policy.maxActive
      ) {
        return {
          ok: false,
          error: `Maximal ${policy.maxActive} gleichzeitig aktive Verbindungen`,
        };
      }
      await audit.append({
        category: "connection",
        actor: "user",
        action: "connection_connect_requested",
        details: { id: cid, kind: conn.kind },
      });
      try {
        await manager.connect(conn);
        return { ok: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await audit.append({
          category: "connection",
          actor: "system",
          action: "connection_connect_failed",
          details: { id: cid, error: message },
        });
        return { ok: false, error: message };
      }
    },

    "connections.disconnect": async (id: unknown): Promise<boolean> => {
      const cid = checkId(id);
      await manager.disconnect(cid);
      await audit.append({
        category: "connection",
        actor: "user",
        action: "connection_disconnected",
        details: { id: cid },
      });
      return true;
    },

    "connections.write": async (
      reqRaw: unknown,
    ): Promise<{ ok: boolean; error?: string }> => {
      const r = (reqRaw ?? {}) as Record<string, unknown>;
      const connectionId = checkId(r["connectionId"]);
      const channel = r["channel"];
      const value = r["value"];
      if (typeof channel !== "string" || channel.length === 0 || channel.length > 128) {
        fail("Ungültiger Kanal");
      }
      if (
        !(typeof value === "number" && Number.isFinite(value)) &&
        typeof value !== "boolean" &&
        !(typeof value === "string" && value.length <= 256)
      ) {
        fail("Ungültiger Wert");
      }
      const req: WriteRequest = { connectionId, channel, value };
      try {
        await manager.write(req.connectionId, req.channel, req.value);
        await audit.append({
          category: "connection",
          actor: "user",
          action: "device_write",
          details: { ...req },
        });
        return { ok: true };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await audit.append({
          category: "warning",
          actor: "system",
          action: "device_write_failed",
          details: { ...req, error: message },
        });
        return { ok: false, error: message };
      }
    },
  };
}

export type Backend = ReturnType<typeof createBackend>;
export type BackendMethod = keyof Backend;

/**
 * Connects manager/audit events to an outbound event sink (IPC broadcast or
 * WebSocket session). Returns a function that removes all listeners.
 */
export function wireBackendEvents(
  deps: Pick<BackendDeps, "store" | "audit" | "manager">,
  emit: (e: BackendEvent) => void,
): () => void {
  const { store, audit, manager } = deps;
  const offs = [
    audit.subscribe((entry) => emit({ event: "audit", payload: entry })),
    manager.onStatus((connectionId, status, error) => {
      store.setStatus(connectionId, status, error);
      emit({ event: "status", payload: { connectionId, status, error } });
      if (status === "error") {
        audit
          .append({
            category: "warning",
            actor: "system",
            action: "connection_error",
            details: { connectionId, error },
          })
          .catch(() => undefined);
      }
    }),
    manager.onSample((sample) => emit({ event: "telemetry", payload: sample })),
    manager.onNotice((connectionId, n) => {
      audit
        .append({
          category: n.level === "info" ? "system" : n.level,
          actor: "system",
          action: n.action,
          details: { connectionId, message: n.message, ...n.details },
        })
        .catch(() => undefined);
    }),
  ];
  return () => {
    for (const off of offs) off();
  };
}

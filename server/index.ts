/**
 * maazi.de | LTor — web backend.
 *
 * Serves the WebSocket JSON-RPC protocol of src/renderer/src/ipc/wsTransport.ts
 * on path /ltor (plus GET /ltor/health). Two modes:
 *
 *   demo (default)  Public web demo. Every browser tab gets its own private,
 *                   in-memory session. Only the built-in laser simulator is
 *                   allowed – the server never opens connections to other
 *                   hosts on behalf of visitors.
 *   full            Self-hosted lab server: all protocols (OPC UA, MQTT,
 *                   REST, sim), one shared state persisted to --data.
 *                   Never expose this mode to the internet without your own
 *                   authentication in front of it.
 *
 * Options (CLI flag or environment variable):
 *   --port    LTOR_PORT             default 8646
 *   --host    LTOR_HOST             default 127.0.0.1
 *   --mode    LTOR_MODE             demo | full (default demo)
 *   --data    LTOR_DATA_DIR         full mode storage (default ./ltor-data)
 *   --static  LTOR_STATIC_DIR       also serve the web build (local preview)
 *   --origins LTOR_ALLOWED_ORIGINS  comma-separated allowed Origin headers
 *   --max-sessions LTOR_MAX_SESSIONS default 200
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import type { ConnectionKind, SystemInfo } from "@shared/types";
import { AuditLog } from "@main/audit/auditLog";
import { ConnectionStore } from "@main/store/connectionStore";
import { ProtocolManager, type AdapterFactory } from "@main/protocols/manager";
import { buildSimAdapter } from "@main/protocols/simFactory";
import {
  createBackend,
  wireBackendEvents,
  type Backend,
  type BackendEvent,
  type BackendPolicy,
} from "@main/backend";

declare const __LTOR_VERSION__: string;
const VERSION = typeof __LTOR_VERSION__ === "string" ? __LTOR_VERSION__ : "dev";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function opt(flag: string, env: string, fallback: string): string {
  const i = process.argv.indexOf(`--${flag}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[env] ?? fallback;
}

const config = {
  port: Number(opt("port", "LTOR_PORT", "8646")),
  host: opt("host", "LTOR_HOST", "127.0.0.1"),
  mode: opt("mode", "LTOR_MODE", "demo") === "full" ? "full" : ("demo" as "demo" | "full"),
  dataDir: resolve(opt("data", "LTOR_DATA_DIR", "ltor-data")),
  staticDir: opt("static", "LTOR_STATIC_DIR", ""),
  origins: opt("origins", "LTOR_ALLOWED_ORIGINS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  maxSessions: Number(opt("max-sessions", "LTOR_MAX_SESSIONS", "200")),
};

/** Idle demo sessions are discarded after this time without any open tab. */
const SESSION_TTL_MS = 15 * 60 * 1000;
/** Simulated devices of a session without open tab are stopped after this
 *  grace period (a page reload reconnects well within it). */
const IDLE_STOP_MS = 60 * 1000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Per-socket rate limit: token bucket. */
const RATE_PER_S = 40;
const RATE_BURST = 80;
/** Drop telemetry for clients that cannot keep up (bytes queued). */
const MAX_BUFFERED_BYTES = 1024 * 1024;

const DEMO_KINDS: ConnectionKind[] = ["sim"];
const FULL_KINDS: ConnectionKind[] = ["opcua", "mqtt", "rest", "sim"];

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString(), "[ltor]", ...args);

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

class Session {
  readonly sockets = new Set<WebSocket>();
  lastSeen = Date.now();
  private expireTimer?: NodeJS.Timeout;
  private idleTimer?: NodeJS.Timeout;
  private offEvents?: () => void;
  backend!: Backend;
  private manager!: ProtocolManager;

  constructor(
    readonly id: string,
    private readonly onExpire: (s: Session) => void,
  ) {}

  async init(opts: {
    factory: AdapterFactory;
    store: ConnectionStore;
    audit: AuditLog;
    policy: BackendPolicy;
    seed: boolean;
  }): Promise<void> {
    this.manager = new ProtocolManager(opts.factory);
    await opts.store.init();
    const deps = { store: opts.store, audit: opts.audit, manager: this.manager };
    this.offEvents = wireBackendEvents(deps, (e) => this.broadcast(e));
    await opts.audit.init();
    this.backend = createBackend({
      ...deps,
      policy: opts.policy,
      sysInfo: (): SystemInfo => ({
        appVersion: VERSION,
        electronVersion: "",
        nodeVersion: process.versions.node,
        platform: process.platform,
        userDataDir: config.mode === "demo" ? "(Sitzung im Arbeitsspeicher)" : config.dataDir,
        mode: config.mode === "demo" ? "demo" : "server",
        allowedKinds: opts.policy.allowedKinds,
      }),
    });
    if (opts.seed && opts.store.size === 0) {
      await opts.store.create({
        name: "Laserlabor · DPSS 532 nm",
        kind: "sim",
        config: { model: "dpss532", sampleRateHz: 5, noise: 0.3 },
      });
    }
  }

  attach(ws: WebSocket): void {
    if (this.expireTimer) clearTimeout(this.expireTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.expireTimer = undefined;
    this.idleTimer = undefined;
    this.sockets.add(ws);
    this.lastSeen = Date.now();
  }

  detach(ws: WebSocket): void {
    this.sockets.delete(ws);
    this.lastSeen = Date.now();
    if (this.sockets.size === 0 && config.mode === "demo") {
      this.idleTimer = setTimeout(
        () => void this.manager.disconnectAll().catch(() => undefined),
        IDLE_STOP_MS,
      );
      this.expireTimer = setTimeout(() => this.onExpire(this), SESSION_TTL_MS);
    }
  }

  async dispose(): Promise<void> {
    if (this.expireTimer) clearTimeout(this.expireTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.offEvents?.();
    await this.manager.disconnectAll().catch(() => undefined);
    for (const ws of this.sockets) ws.close(1001, "session closed");
  }

  private broadcast(e: BackendEvent): void {
    const msg = JSON.stringify(e);
    for (const ws of this.sockets) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (e.event === "telemetry" && ws.bufferedAmount > MAX_BUFFERED_BYTES) continue;
      ws.send(msg);
    }
  }
}

const sessions = new Map<string, Session>();
let fullFactory: AdapterFactory | undefined;

async function expire(s: Session): Promise<void> {
  if (s.sockets.size > 0) return;
  sessions.delete(s.id);
  await s.dispose();
}

async function getSession(requestedId: string | null): Promise<Session | null> {
  if (config.mode === "full") {
    let s = sessions.get("shared");
    if (!s) {
      if (!fullFactory) {
        // Loaded lazily so the demo build never touches node-opcua & co.
        fullFactory = (await import("@main/protocols/factory")).buildAnyAdapter;
      }
      s = new Session("shared", () => undefined);
      await s.init({
        factory: fullFactory,
        store: new ConnectionStore(ConnectionStore.defaultPath(config.dataDir)),
        audit: new AuditLog(AuditLog.defaultPath(config.dataDir)),
        policy: { allowedKinds: FULL_KINDS, untrusted: false },
        seed: false,
      });
      sessions.set("shared", s);
    }
    return s;
  }

  if (requestedId) {
    const existing = sessions.get(requestedId);
    if (existing) return existing;
  }
  if (sessions.size >= config.maxSessions) {
    // Evict the longest idle session without open tabs, else refuse.
    const idle = [...sessions.values()]
      .filter((s) => s.sockets.size === 0)
      .sort((a, b) => a.lastSeen - b.lastSeen)[0];
    if (!idle) return null;
    sessions.delete(idle.id);
    await idle.dispose();
  }
  const id = requestedId ?? randomUUID();
  const s = new Session(id, (x) => void expire(x));
  await s.init({
    factory: buildSimAdapter,
    store: new ConnectionStore(null),
    audit: new AuditLog(null, 1000),
    policy: {
      allowedKinds: DEMO_KINDS,
      maxConnections: 6,
      maxActive: 3,
      untrusted: true,
      kindDeniedMessage:
        "In der öffentlichen Demo sind nur Simulator-Verbindungen (Laserlabor) " +
        "erlaubt. Für OPC UA, MQTT und REST bitte die Desktop-App verwenden: " +
        "https://github.com/ATOMICMBAG/LTor",
    },
    seed: true,
  });
  sessions.set(id, s);
  return s;
}

// ---------------------------------------------------------------------------
// HTTP: health check + optional static files (local preview only)
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!config.staticDir || (req.method !== "GET" && req.method !== "HEAD")) return false;
  const root = resolve(config.staticDir);
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = resolve(join(root, urlPath));
  if (file !== root && !file.startsWith(root + sep)) return false;
  try {
    const st = await fs.stat(file);
    if (st.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(root, "index.html"); // SPA fallback
  }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  } catch {
    return false;
  }
}

const http = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/ltor/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(
      JSON.stringify({
        ok: true,
        version: VERSION,
        mode: config.mode,
        sessions: sessions.size,
        uptimeS: Math.round(process.uptime()),
      }),
    );
    return;
  }
  void serveStatic(req, res).then((served) => {
    if (served) return;
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
});

// ---------------------------------------------------------------------------
// WebSocket JSON-RPC
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
const SID_RE = /^[A-Za-z0-9-]{16,64}$/;

http.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname !== "/ltor") {
    socket.destroy();
    return;
  }
  const origin = req.headers.origin;
  if (config.origins.length > 0 && (!origin || !config.origins.includes(origin))) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const sid = url.searchParams.get("sid");
  void getSession(sid && SID_RE.test(sid) ? sid : null).then(
    (session) => {
      if (!session) {
        socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws, session));
    },
    (e) => {
      log("session init failed:", e);
      socket.destroy();
    },
  );
});

type Alive = WebSocket & { isAlive?: boolean };

function onSocket(ws: Alive, session: Session): void {
  session.attach(ws);
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  let tokens = RATE_BURST;
  let lastRefill = Date.now();

  const reply = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  ws.on("message", (data, isBinary) => {
    const now = Date.now();
    tokens = Math.min(RATE_BURST, tokens + ((now - lastRefill) / 1000) * RATE_PER_S);
    lastRefill = now;
    if (tokens < 1) return; // silently drop – client will time out
    tokens -= 1;
    if (isBinary) return;

    let msg: { id?: unknown; method?: unknown; params?: unknown };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const id = msg.id;
    if (typeof id !== "string" || id.length > 64) return;
    const method = msg.method;
    const params = Array.isArray(msg.params) ? msg.params.slice(0, 4) : [];
    if (
      typeof method !== "string" ||
      !Object.prototype.hasOwnProperty.call(session.backend, method)
    ) {
      reply({ id, ok: false, error: `Unknown method: ${String(method)}` });
      return;
    }
    const fn = session.backend[method as keyof Backend] as (
      ...args: unknown[]
    ) => Promise<unknown>;
    fn(...params).then(
      (result) => reply({ id, ok: true, result }),
      (e) => reply({ id, ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
  });

  ws.on("close", () => session.detach(ws));
  ws.on("error", () => session.detach(ws));
}

// Drop dead connections (laptops going to sleep etc.)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients as Set<Alive>) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

http.listen(config.port, config.host, () => {
  log(
    `v${VERSION} mode=${config.mode} listening on http://${config.host}:${config.port}` +
      ` (ws path /ltor${config.staticDir ? `, static ${resolve(config.staticDir)}` : ""})`,
  );
  if (config.mode === "full") log(`data dir ${config.dataDir}`);
  if (config.origins.length) log(`allowed origins: ${config.origins.join(", ")}`);
});

async function shutdown(signal: string): Promise<void> {
  log(`${signal} – shutting down`);
  clearInterval(heartbeat);
  await Promise.allSettled([...sessions.values()].map((s) => s.dispose()));
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

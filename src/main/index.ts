import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  IPC,
  type Connection,
  type ConnectionKind,
  type SystemInfo,
  type WriteRequest,
} from "@shared/types";
import { AuditLog } from "./audit/auditLog";
import { ConnectionStore } from "./store/connectionStore";
import { ProtocolManager } from "./protocols/manager";

// Electron-Vite injects MAIN_VITE_* env at build time; we don't rely on them here.

const __filename = fileURLToPath(import.meta.url);
const __dirnameMain = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let audit: AuditLog;
let store: ConnectionStore;
const manager = new ProtocolManager();

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    backgroundColor: "#ffffff",
    title: "maazi.de|LTor — Laser Tor",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirnameMain, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(join(__dirnameMain, "../renderer/index.html"));
  }

  // DevTools are opt-in via:
  //   - CLI flag:  electron-vite dev -- --devtools
  //   - Env var:   LTOR_DEVTOOLS=1
  //   - Keyboard:  F12 / Ctrl+Shift+I (handled by Electron defaults)
  if (
    process.argv.includes("--devtools") ||
    process.env["LTOR_DEVTOOLS"] === "1"
  ) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function registerIpc(): void {
  // System
  ipcMain.handle(IPC.SYS_INFO, (): SystemInfo => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? "",
      nodeVersion: process.versions.node,
      platform: process.platform,
      userDataDir: app.getPath("userData"),
    };
  });

  // Audit
  ipcMain.handle(IPC.AUDIT_LIST, async (_e, limit?: number) => {
    return audit.list(typeof limit === "number" ? limit : 500);
  });
  ipcMain.handle(
    IPC.AUDIT_APPEND,
    async (
      _e,
      input: {
        category: Parameters<AuditLog["append"]>[0]["category"];
        actor: "user" | "system";
        action: string;
        details?: Record<string, unknown>;
      },
    ) => {
      return audit.append(input);
    },
  );
  ipcMain.handle(IPC.AUDIT_CLEAR, async () => {
    await audit.clear();
    return true;
  });

  // Connections
  ipcMain.handle(IPC.CONN_LIST, () => store.list());

  ipcMain.handle(
    IPC.CONN_CREATE,
    async (
      _e,
      input: {
        name: string;
        kind: ConnectionKind;
        config: Connection["config"];
      },
    ) => {
      const conn = await store.create(input);
      await audit.append({
        category: "connection",
        actor: "user",
        action: "connection_created",
        details: { id: conn.id, name: conn.name, kind: conn.kind },
      });
      return conn;
    },
  );

  ipcMain.handle(
    IPC.CONN_UPDATE,
    async (
      _e,
      id: string,
      patch: Partial<Pick<Connection, "name" | "config">>,
    ) => {
      const updated = await store.update(id, patch);
      if (updated) {
        await audit.append({
          category: "connection",
          actor: "user",
          action: "connection_updated",
          details: { id, fields: Object.keys(patch) },
        });
      }
      return updated;
    },
  );

  ipcMain.handle(IPC.CONN_DELETE, async (_e, id: string) => {
    await manager.disconnect(id).catch(() => undefined);
    const ok = await store.delete(id);
    if (ok) {
      await audit.append({
        category: "connection",
        actor: "user",
        action: "connection_deleted",
        details: { id },
      });
    }
    return ok;
  });

  ipcMain.handle(IPC.CONN_CONNECT, async (_e, id: string) => {
    const conn = store.get(id);
    if (!conn) throw new Error(`Connection ${id} not found`);
    await audit.append({
      category: "connection",
      actor: "user",
      action: "connection_connect_requested",
      details: { id, kind: conn.kind },
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
        details: { id, error: message },
      });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC.CONN_DISCONNECT, async (_e, id: string) => {
    await manager.disconnect(id);
    await audit.append({
      category: "connection",
      actor: "user",
      action: "connection_disconnected",
      details: { id },
    });
    return true;
  });

  ipcMain.handle(IPC.CONN_WRITE, async (_e, req: WriteRequest) => {
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
  });
}

function wireManagerEvents(): void {
  manager.onStatus((connectionId, status, error) => {
    store.setStatus(connectionId, status, error);
    broadcast(IPC.EVT_CONN_STATUS, { connectionId, status, error });
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
  });

  manager.onSample((sample) => {
    broadcast(IPC.EVT_TELEMETRY, sample);
  });
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const userData = app.getPath("userData");
  audit = new AuditLog(AuditLog.defaultPath(userData));
  store = new ConnectionStore(ConnectionStore.defaultPath(userData));
  await audit.init();
  await store.init();

  audit.subscribe((entry) => broadcast(IPC.EVT_AUDIT, entry));

  registerIpc();
  wireManagerEvents();

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}

app.on("window-all-closed", async () => {
  await manager.disconnectAll().catch(() => undefined);
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async (event) => {
  if (manager["adapters"]?.size > 0) {
    event.preventDefault();
    await manager.disconnectAll().catch(() => undefined);
    app.quit();
  }
});

bootstrap().catch((err) => {
  console.error("[main] bootstrap failed:", err);
  app.exit(1);
});

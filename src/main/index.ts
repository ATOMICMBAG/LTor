import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { IPC, type ConnectionKind, type SystemInfo } from "@shared/types";
import { AuditLog } from "./audit/auditLog";
import { ConnectionStore } from "./store/connectionStore";
import { ProtocolManager } from "./protocols/manager";
import { buildAnyAdapter } from "./protocols/factory";
import { createBackend, wireBackendEvents, type Backend } from "./backend";

// Electron-Vite injects MAIN_VITE_* env at build time; we don't rely on them here.

const __filename = fileURLToPath(import.meta.url);
const __dirnameMain = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let audit: AuditLog;
let store: ConnectionStore;
const manager = new ProtocolManager(buildAnyAdapter);
const ALL_KINDS: ConnectionKind[] = ["opcua", "mqtt", "rest", "sim"];

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

function sysInfo(): SystemInfo {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? "",
    nodeVersion: process.versions.node,
    platform: process.platform,
    userDataDir: app.getPath("userData"),
    mode: "desktop",
    allowedKinds: ALL_KINDS,
  };
}

/** Maps the Electron IPC channels onto the shared backend handlers. */
function registerIpc(backend: Backend): void {
  const routes: Array<[string, keyof Backend]> = [
    [IPC.SYS_INFO, "sys.info"],
    [IPC.AUDIT_LIST, "audit.list"],
    [IPC.AUDIT_APPEND, "audit.append"],
    [IPC.AUDIT_CLEAR, "audit.clear"],
    [IPC.CONN_LIST, "connections.list"],
    [IPC.CONN_CREATE, "connections.create"],
    [IPC.CONN_UPDATE, "connections.update"],
    [IPC.CONN_DELETE, "connections.delete"],
    [IPC.CONN_CONNECT, "connections.connect"],
    [IPC.CONN_DISCONNECT, "connections.disconnect"],
    [IPC.CONN_WRITE, "connections.write"],
  ];
  for (const [channel, method] of routes) {
    const handler = backend[method] as (...args: unknown[]) => Promise<unknown>;
    ipcMain.handle(channel, (_e, ...args: unknown[]) => handler(...args));
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const userData = app.getPath("userData");
  audit = new AuditLog(AuditLog.defaultPath(userData));
  store = new ConnectionStore(ConnectionStore.defaultPath(userData));
  await audit.init();
  await store.init();

  const deps = { store, audit, manager };
  wireBackendEvents(deps, (e) => {
    const channel =
      e.event === "audit" ? IPC.EVT_AUDIT
      : e.event === "status" ? IPC.EVT_CONN_STATUS
      : IPC.EVT_TELEMETRY;
    broadcast(channel, e.payload);
  });
  registerIpc(
    createBackend({
      ...deps,
      sysInfo,
      policy: { allowedKinds: ALL_KINDS, untrusted: false },
    }),
  );

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
  if (manager.activeCount > 0) {
    event.preventDefault();
    await manager.disconnectAll().catch(() => undefined);
    app.quit();
  }
});

bootstrap().catch((err) => {
  console.error("[main] bootstrap failed:", err);
  app.exit(1);
});

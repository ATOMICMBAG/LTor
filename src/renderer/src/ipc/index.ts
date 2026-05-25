import type { LtorTransport } from "./transport";
import { createElectronTransport } from "./electronTransport";
import { createWebSocketTransport } from "./wsTransport";
import { createNullTransport } from "./nullTransport";

/**
 * Resolve the active LtorTransport at startup.
 *
 * Priority:
 *   1. If `window.ltor` is exposed by the Electron preload → use it.
 *   2. Else if the build-time variable `VITE_LTOR_WS_URL` is set → connect via
 *      WebSocket to that URL (e.g. `wss://lasertor.example.com/ws`).
 *   3. Else if running in a normal browser → connect to `ws[s]://<host>/ltor`
 *      by default so a backend deployed next to the static frontend Just Works.
 *   4. Otherwise → return a "null" transport that rejects all calls with a
 *      helpful error message, instead of hanging.
 */
function resolveTransport(): LtorTransport {
  if (
    typeof window !== "undefined" &&
    (window as { ltor?: unknown }).ltor !== undefined
  ) {
    return createElectronTransport();
  }

  const envUrl = (import.meta as { env?: Record<string, string | undefined> })
    .env?.["VITE_LTOR_WS_URL"];
  if (envUrl && envUrl.length > 0) {
    return createWebSocketTransport(envUrl);
  }

  if (typeof window !== "undefined" && window.location) {
    // Best-effort default: same host, /ltor path.
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    // In dev (Vite on :5173) there is no backend at /ltor → null transport.
    const isViteDev =
      window.location.port === "5173" &&
      window.location.hostname === "localhost";
    if (!isViteDev) {
      return createWebSocketTransport(`${proto}//${window.location.host}/ltor`);
    }
  }

  return createNullTransport(
    "Kein Backend verfügbar. Diese Ansicht funktioniert nur in der Electron-" +
      "Desktop-App oder mit konfigurierter Umgebungsvariable VITE_LTOR_WS_URL.",
  );
}

/** The single transport instance used by the entire renderer. */
export const ipc: LtorTransport = resolveTransport();

export type { LtorTransport } from "./transport";

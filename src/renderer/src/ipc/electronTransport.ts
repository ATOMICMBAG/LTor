import type { LtorTransport } from "./transport";

/**
 * Wraps `window.ltor` (set up by the Electron preload) behind the generic
 * LtorTransport interface so the rest of the renderer never imports
 * Electron-specific symbols.
 *
 * Caller must ensure `window.ltor` exists before constructing this.
 */
export function createElectronTransport(): LtorTransport {
  const w = window as unknown as { ltor: LtorTransport };
  const api = w.ltor;
  return {
    mode: "electron",
    sys: api.sys,
    audit: api.audit,
    connections: api.connections,
  };
}

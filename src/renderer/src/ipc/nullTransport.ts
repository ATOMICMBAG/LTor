import type { LtorTransport } from "./transport";

/**
 * Fallback transport used when neither Electron nor a WebSocket URL is
 * configured (e.g. when opening the dev URL `http://localhost:5173` in a
 * normal browser). Every method rejects with a clear, localised error so the
 * UI surfaces the situation instead of hanging.
 */
export function createNullTransport(reason: string): LtorTransport {
  const reject = async (): Promise<never> => {
    throw new Error(reason);
  };
  return {
    mode: "none",
    sys: { info: reject },
    audit: {
      list: reject,
      append: reject,
      clear: reject,
      onEntry: () => () => undefined,
    },
    connections: {
      list: reject,
      create: reject,
      update: reject,
      delete: reject,
      connect: reject,
      disconnect: reject,
      write: reject,
      onStatus: () => () => undefined,
      onTelemetry: () => () => undefined,
    },
  };
}

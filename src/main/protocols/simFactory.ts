import type { Connection, SimConfig } from "@shared/types";
import type { ProtocolAdapter } from "./adapter";
import { SimAdapter } from "./simAdapter";

/**
 * Simulator-only adapter set for the public web demo. Deliberately does not
 * import the OPC UA / MQTT / REST adapters: the demo server must never open
 * network connections on behalf of anonymous visitors (SSRF protection).
 */
export function buildSimAdapter(conn: Connection): ProtocolAdapter {
  if (conn.kind !== "sim") {
    throw new Error(
      "In der öffentlichen Demo sind nur Simulator-Verbindungen erlaubt.",
    );
  }
  return new SimAdapter(conn.id, conn.config as SimConfig);
}

import type {
  Connection,
  MqttConfig,
  OpcUaConfig,
  RestConfig,
  SimConfig,
} from "@shared/types";
import type { ProtocolAdapter } from "./adapter";
import { OpcUaAdapter } from "./opcuaAdapter";
import { MqttAdapter } from "./mqttAdapter";
import { RestAdapter } from "./restAdapter";
import { SimAdapter } from "./simAdapter";

/** Full adapter set: real field protocols plus the laser simulator. */
export function buildAnyAdapter(conn: Connection): ProtocolAdapter {
  switch (conn.kind) {
    case "opcua":
      return new OpcUaAdapter(conn.id, conn.config as OpcUaConfig);
    case "mqtt":
      return new MqttAdapter(conn.id, conn.config as MqttConfig);
    case "rest":
      return new RestAdapter(conn.id, conn.config as RestConfig);
    case "sim":
      return new SimAdapter(conn.id, conn.config as SimConfig);
    default:
      throw new Error(`Unknown connection kind: ${(conn as Connection).kind}`);
  }
}

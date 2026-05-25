// Shared types for IPC between main and renderer.
// Keep this file dependency-free.

export type ConnectionKind = "opcua" | "mqtt" | "rest";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// ---------- OPC UA ----------
export interface OpcUaNode {
  /** OPC UA NodeId, e.g. "ns=2;s=Demo.Static.Scalar.Double". */
  nodeId: string;
  /** Friendly channel name used in telemetry events and UI. */
  channel: string;
  samplingInterval?: number;
}

export interface OpcUaConfig {
  endpoint: string; // e.g. opc.tcp://localhost:4840
  nodes: OpcUaNode[];
  username?: string;
  password?: string;
  securityMode?: "None" | "Sign" | "SignAndEncrypt";
  securityPolicy?:
    | "None"
    | "Basic256Sha256"
    | "Aes128_Sha256_RsaOaep"
    | "Aes256_Sha256_RsaPss";
  publishingIntervalMs?: number;
}

// ---------- MQTT ----------
export interface MqttSubscription {
  topic: string;
  channel: string;
  qos?: 0 | 1 | 2;
}

export interface MqttConfig {
  brokerUrl: string; // e.g. mqtt://broker:1883 or wss://broker:8084
  clientId?: string;
  username?: string;
  password?: string;
  subscriptions: MqttSubscription[];
}

// ---------- REST ----------
export interface RestPoll {
  path: string;
  channel: string;
  intervalMs: number;
  /** Optional JSON path/expression to extract a value, e.g. "$.value" or "data.value". */
  jsonPath?: string;
}

export interface RestConfig {
  baseUrl: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  polling: RestPoll[];
}

export interface Connection {
  id: string;
  name: string;
  kind: ConnectionKind;
  status: ConnectionStatus;
  lastError?: string;
  createdAt: number;
  config: OpcUaConfig | MqttConfig | RestConfig;
}

export interface TelemetrySample {
  connectionId: string;
  channel: string; // node label / topic / endpoint label
  value: number | string | boolean | null;
  ts: number; // ms since epoch
  unit?: string;
}

export type AuditCategory =
  | "system"
  | "connection"
  | "telemetry"
  | "sensor"
  | "user"
  | "warning"
  | "alarm";

export interface AuditEntry {
  id: string;
  ts: number;
  category: AuditCategory;
  actor: "user" | "system";
  action: string;
  details?: Record<string, unknown>;
}

// IPC channel names (single source of truth)
export const IPC = {
  // Connections
  CONN_LIST: "conn:list",
  CONN_CREATE: "conn:create",
  CONN_UPDATE: "conn:update",
  CONN_DELETE: "conn:delete",
  CONN_CONNECT: "conn:connect",
  CONN_DISCONNECT: "conn:disconnect",
  CONN_WRITE: "conn:write",
  // Events emitted from main → renderer
  EVT_CONN_STATUS: "evt:conn:status",
  EVT_TELEMETRY: "evt:telemetry",
  EVT_AUDIT: "evt:audit",
  // Audit
  AUDIT_LIST: "audit:list",
  AUDIT_APPEND: "audit:append",
  AUDIT_CLEAR: "audit:clear",
  // System
  SYS_INFO: "sys:info",
} as const;

export interface SystemInfo {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  userDataDir: string;
}

export interface WriteRequest {
  connectionId: string;
  channel: string; // nodeId / topic / endpoint label
  value: number | string | boolean;
}

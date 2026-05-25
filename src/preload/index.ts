import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type AuditEntry,
  type Connection,
  type ConnectionKind,
  type ConnectionStatus,
  type SystemInfo,
  type TelemetrySample,
  type WriteRequest,
} from "@shared/types";

const api = {
  sys: {
    info: (): Promise<SystemInfo> => ipcRenderer.invoke(IPC.SYS_INFO),
  },
  audit: {
    list: (limit?: number): Promise<AuditEntry[]> =>
      ipcRenderer.invoke(IPC.AUDIT_LIST, limit),
    append: (input: {
      category: AuditEntry["category"];
      actor: AuditEntry["actor"];
      action: string;
      details?: Record<string, unknown>;
    }): Promise<AuditEntry> => ipcRenderer.invoke(IPC.AUDIT_APPEND, input),
    clear: (): Promise<boolean> => ipcRenderer.invoke(IPC.AUDIT_CLEAR),
    onEntry(cb: (entry: AuditEntry) => void): () => void {
      const handler = (_e: unknown, entry: AuditEntry) => cb(entry);
      ipcRenderer.on(IPC.EVT_AUDIT, handler);
      return () => ipcRenderer.off(IPC.EVT_AUDIT, handler);
    },
  },
  connections: {
    list: (): Promise<Connection[]> => ipcRenderer.invoke(IPC.CONN_LIST),
    create: (input: {
      name: string;
      kind: ConnectionKind;
      config: Connection["config"];
    }): Promise<Connection> => ipcRenderer.invoke(IPC.CONN_CREATE, input),
    update: (
      id: string,
      patch: Partial<Pick<Connection, "name" | "config">>,
    ): Promise<Connection | undefined> =>
      ipcRenderer.invoke(IPC.CONN_UPDATE, id, patch),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.CONN_DELETE, id),
    connect: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.CONN_CONNECT, id),
    disconnect: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.CONN_DISCONNECT, id),
    write: (req: WriteRequest): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.CONN_WRITE, req),
    onStatus(
      cb: (e: {
        connectionId: string;
        status: ConnectionStatus;
        error?: string;
      }) => void,
    ): () => void {
      const handler = (
        _e: unknown,
        payload: {
          connectionId: string;
          status: ConnectionStatus;
          error?: string;
        },
      ) => cb(payload);
      ipcRenderer.on(IPC.EVT_CONN_STATUS, handler);
      return () => ipcRenderer.off(IPC.EVT_CONN_STATUS, handler);
    },
    onTelemetry(cb: (sample: TelemetrySample) => void): () => void {
      const handler = (_e: unknown, sample: TelemetrySample) => cb(sample);
      ipcRenderer.on(IPC.EVT_TELEMETRY, handler);
      return () => ipcRenderer.off(IPC.EVT_TELEMETRY, handler);
    },
  },
};

export type LtorApi = typeof api;

contextBridge.exposeInMainWorld("ltor", api);

import type {
  Connection,
  ConnectionStatus,
  MqttConfig,
  OpcUaConfig,
  RestConfig,
  TelemetrySample,
} from "@shared/types";
import type { ProtocolAdapter } from "./adapter";
import { OpcUaAdapter } from "./opcuaAdapter";
import { MqttAdapter } from "./mqttAdapter";
import { RestAdapter } from "./restAdapter";

interface ManagedAdapter {
  adapter: ProtocolAdapter;
  unsubSample: () => void;
  unsubStatus: () => void;
}

/**
 * Owns the lifecycle of all runtime adapters keyed by connection id.
 * Forwards adapter events to listeners (main → renderer bridge).
 */
export class ProtocolManager {
  private adapters = new Map<string, ManagedAdapter>();
  private statusListeners = new Set<
    (
      connectionId: string,
      status: ConnectionStatus,
      error: string | undefined,
    ) => void
  >();
  private sampleListeners = new Set<(sample: TelemetrySample) => void>();

  onStatus(
    fn: (
      connectionId: string,
      status: ConnectionStatus,
      error: string | undefined,
    ) => void,
  ): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }
  onSample(fn: (sample: TelemetrySample) => void): () => void {
    this.sampleListeners.add(fn);
    return () => this.sampleListeners.delete(fn);
  }

  async connect(conn: Connection): Promise<void> {
    // Disconnect existing if reconnecting with new config
    await this.disconnect(conn.id);

    const adapter = this.buildAdapter(conn);

    const unsubSample = adapter.onSample((s) => {
      for (const fn of this.sampleListeners) fn(s);
    });
    const unsubStatus = adapter.onStatus((status, error) => {
      for (const fn of this.statusListeners) fn(conn.id, status, error);
    });
    this.adapters.set(conn.id, { adapter, unsubSample, unsubStatus });

    try {
      await adapter.connect();
    } catch (e) {
      // status already emitted by adapter
      this.adapters.delete(conn.id);
      unsubSample();
      unsubStatus();
      throw e;
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const managed = this.adapters.get(connectionId);
    if (!managed) return;
    try {
      await managed.adapter.disconnect();
    } finally {
      managed.unsubSample();
      managed.unsubStatus();
      this.adapters.delete(connectionId);
    }
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.adapters.keys());
    await Promise.allSettled(ids.map((id) => this.disconnect(id)));
  }

  async write(
    connectionId: string,
    channel: string,
    value: number | string | boolean,
  ): Promise<void> {
    const managed = this.adapters.get(connectionId);
    if (!managed) throw new Error(`No active adapter for ${connectionId}`);
    await managed.adapter.write(channel, value);
  }

  isConnected(connectionId: string): boolean {
    return this.adapters.has(connectionId);
  }

  private buildAdapter(conn: Connection): ProtocolAdapter {
    switch (conn.kind) {
      case "opcua":
        return new OpcUaAdapter(conn.id, conn.config as OpcUaConfig);
      case "mqtt":
        return new MqttAdapter(conn.id, conn.config as MqttConfig);
      case "rest":
        return new RestAdapter(conn.id, conn.config as RestConfig);
      default:
        throw new Error(
          `Unknown connection kind: ${(conn as Connection).kind}`,
        );
    }
  }
}

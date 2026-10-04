import type {
  AdapterNotice,
  Connection,
  ConnectionStatus,
  TelemetrySample,
} from "@shared/types";
import type { ProtocolAdapter } from "./adapter";

/** Builds the runtime adapter for a connection (see ./factory.ts). */
export type AdapterFactory = (conn: Connection) => ProtocolAdapter;

interface ManagedAdapter {
  adapter: ProtocolAdapter;
  unsubSample: () => void;
  unsubStatus: () => void;
  unsubNotice: () => void;
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
  private noticeListeners = new Set<
    (connectionId: string, notice: AdapterNotice) => void
  >();

  constructor(private readonly buildAdapter: AdapterFactory) {}

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
  onNotice(
    fn: (connectionId: string, notice: AdapterNotice) => void,
  ): () => void {
    this.noticeListeners.add(fn);
    return () => this.noticeListeners.delete(fn);
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
    const unsubNotice =
      adapter.onNotice?.((n) => {
        for (const fn of this.noticeListeners) fn(conn.id, n);
      }) ?? (() => undefined);
    this.adapters.set(conn.id, {
      adapter,
      unsubSample,
      unsubStatus,
      unsubNotice,
    });

    try {
      await adapter.connect();
    } catch (e) {
      // status already emitted by adapter
      this.adapters.delete(conn.id);
      unsubSample();
      unsubStatus();
      unsubNotice();
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
      managed.unsubNotice();
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

  get activeCount(): number {
    return this.adapters.size;
  }
}

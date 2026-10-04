import type {
  AdapterNotice,
  ConnectionKind,
  TelemetrySample,
} from "@shared/types";

/**
 * Common interface every protocol adapter implements.
 * The runtime manager doesn't care if it's OPC UA, MQTT or REST behind it.
 */
export interface ProtocolAdapter {
  readonly id: string;
  readonly kind: ConnectionKind;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /**
   * Write a value to the device (e.g. setpoint).
   * Throws if not supported or not connected.
   */
  write(channel: string, value: number | string | boolean): Promise<void>;

  /** Subscribe to incoming samples. Returns an unsubscribe function. */
  onSample(fn: (sample: TelemetrySample) => void): () => void;

  /** Subscribe to lifecycle / error events. */
  onStatus(
    fn: (
      status: "connecting" | "connected" | "disconnected" | "error",
      error?: string,
    ) => void,
  ): () => void;

  /** Subscribe to device notices (safety trips, limits …). Optional. */
  onNotice?(fn: (notice: AdapterNotice) => void): () => void;
}

/** Mixin helper for adapter implementations. */
export class AdapterEmitter {
  private noticeSubs = new Set<(n: AdapterNotice) => void>();
  private sampleSubs = new Set<(s: TelemetrySample) => void>();
  private statusSubs = new Set<
    (
      status: "connecting" | "connected" | "disconnected" | "error",
      error?: string,
    ) => void
  >();

  onSample(fn: (s: TelemetrySample) => void): () => void {
    this.sampleSubs.add(fn);
    return () => this.sampleSubs.delete(fn);
  }
  onStatus(
    fn: (
      status: "connecting" | "connected" | "disconnected" | "error",
      error?: string,
    ) => void,
  ): () => void {
    this.statusSubs.add(fn);
    return () => this.statusSubs.delete(fn);
  }

  onNotice(fn: (n: AdapterNotice) => void): () => void {
    this.noticeSubs.add(fn);
    return () => this.noticeSubs.delete(fn);
  }

  protected emitNotice(n: AdapterNotice): void {
    for (const fn of this.noticeSubs) {
      try {
        fn(n);
      } catch (e) {
        console.error("[adapter] notice subscriber failed:", e);
      }
    }
  }

  protected emitSample(s: TelemetrySample): void {
    for (const fn of this.sampleSubs) {
      try {
        fn(s);
      } catch (e) {
        console.error("[adapter] sample subscriber failed:", e);
      }
    }
  }
  protected emitStatus(
    status: "connecting" | "connected" | "disconnected" | "error",
    error?: string,
  ): void {
    for (const fn of this.statusSubs) {
      try {
        fn(status, error);
      } catch (e) {
        console.error("[adapter] status subscriber failed:", e);
      }
    }
  }
}

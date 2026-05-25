import type { TelemetrySample } from "@shared/types";

/**
 * Common interface every protocol adapter implements.
 * The runtime manager doesn't care if it's OPC UA, MQTT or REST behind it.
 */
export interface ProtocolAdapter {
  readonly id: string;
  readonly kind: "opcua" | "mqtt" | "rest";

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
}

/** Mixin helper for adapter implementations. */
export class AdapterEmitter {
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

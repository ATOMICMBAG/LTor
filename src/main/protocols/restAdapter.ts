import axios, { type AxiosInstance } from "axios";
import type { RestConfig, RestPoll, TelemetrySample } from "@shared/types";
import { AdapterEmitter, type ProtocolAdapter } from "./adapter";

export class RestAdapter extends AdapterEmitter implements ProtocolAdapter {
  readonly kind = "rest" as const;
  private http?: AxiosInstance;
  private timers = new Map<string, NodeJS.Timeout>();
  private running = false;

  constructor(
    public readonly id: string,
    private readonly config: RestConfig,
  ) {
    super();
  }

  async connect(): Promise<void> {
    this.emitStatus("connecting");
    try {
      this.http = axios.create({
        baseURL: this.config.baseUrl,
        headers: this.config.headers,
        timeout: 5000,
      });

      // Reachability probe (first poll path, or "/")
      const probe = this.config.polling[0]?.path ?? "/";
      await this.http.request({
        url: probe,
        method: this.config.method ?? "GET",
        validateStatus: () => true,
      });

      this.running = true;
      this.emitStatus("connected");
      for (const p of this.config.polling) this.schedule(p);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.emitStatus("error", message);
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.running = false;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.http = undefined;
    this.emitStatus("disconnected");
  }

  async write(
    channel: string,
    value: number | string | boolean,
  ): Promise<void> {
    if (!this.http) throw new Error("REST not connected");
    const ep = this.config.polling.find((p) => p.channel === channel);
    const path = ep?.path ?? channel;
    await this.http.post(path, { value });
  }

  private schedule(p: RestPoll): void {
    if (!this.running) return;
    const delay = Math.max(100, p.intervalMs || 1000);
    const t = setTimeout(async () => {
      await this.pollOnce(p);
      this.schedule(p);
    }, delay);
    this.timers.set(p.channel, t);
  }

  private async pollOnce(p: RestPoll): Promise<void> {
    if (!this.running || !this.http) return;
    try {
      const res = await this.http.request({
        url: p.path,
        method: this.config.method ?? "GET",
      });
      const value = p.jsonPath ? extractByPath(res.data, p.jsonPath) : res.data;
      const sample: TelemetrySample = {
        connectionId: this.id,
        channel: p.channel,
        value: this.coerce(value),
        ts: Date.now(),
      };
      this.emitSample(sample);
    } catch (e) {
      this.emitSample({
        connectionId: this.id,
        channel: p.channel,
        value: null,
        ts: Date.now(),
      });
      console.warn(
        `[rest:${this.id}] poll '${p.channel}' failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  private coerce(raw: unknown): number | string | boolean | null {
    if (raw === null || raw === undefined) return null;
    if (
      typeof raw === "number" ||
      typeof raw === "string" ||
      typeof raw === "boolean"
    )
      return raw;
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }
}

/**
 * Extract a value from a parsed JSON object using a dotted/JSONPath-like
 * expression. Accepts both "data.value" and "$.data.value".
 */
function extractByPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const cleaned = path.replace(/^\$\.?/, "");
  const parts = cleaned.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (
      cur &&
      typeof cur === "object" &&
      p in (cur as Record<string, unknown>)
    ) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

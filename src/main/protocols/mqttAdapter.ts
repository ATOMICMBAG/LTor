import mqtt, { type MqttClient } from "mqtt";
import type { MqttConfig, TelemetrySample } from "@shared/types";
import { AdapterEmitter, type ProtocolAdapter } from "./adapter";

export class MqttAdapter extends AdapterEmitter implements ProtocolAdapter {
  readonly kind = "mqtt" as const;
  private client?: MqttClient;
  /** topic → label */
  private topicLabels = new Map<string, string>();

  constructor(
    public readonly id: string,
    private readonly config: MqttConfig,
  ) {
    super();
  }

  async connect(): Promise<void> {
    this.emitStatus("connecting");
    return new Promise<void>((resolve, reject) => {
      try {
        this.client = mqtt.connect(this.config.brokerUrl, {
          clientId:
            this.config.clientId ??
            `ltor-${Math.random().toString(16).slice(2, 10)}`,
          username: this.config.username,
          password: this.config.password,
          reconnectPeriod: 5000,
          connectTimeout: 8000,
          clean: true,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.emitStatus("error", message);
        reject(e);
        return;
      }

      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      this.client.on("connect", () => {
        if (!this.client) return;
        for (const t of this.config.subscriptions) {
          this.topicLabels.set(t.topic, t.channel);
          this.client.subscribe(t.topic, { qos: t.qos ?? 0 }, (err) => {
            if (err) {
              console.error(
                `[mqtt:${this.id}] subscribe '${t.topic}' failed:`,
                err.message,
              );
            }
          });
        }
        this.emitStatus("connected");
        settle(() => resolve());
      });

      this.client.on("reconnect", () => this.emitStatus("connecting"));
      this.client.on("close", () => this.emitStatus("disconnected"));
      this.client.on("offline", () => this.emitStatus("disconnected"));

      this.client.on("error", (err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.emitStatus("error", message);
        settle(() => reject(err));
      });

      this.client.on("message", (topic, payload) => {
        const label = this.matchTopic(topic);
        const text = payload.toString("utf-8");
        const sample: TelemetrySample = {
          connectionId: this.id,
          channel: label ?? topic,
          value: this.parsePayload(text),
          ts: Date.now(),
        };
        this.emitSample(sample);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await new Promise<void>((resolve) => {
        this.client!.end(true, {}, () => resolve());
      });
      this.client = undefined;
    }
    this.topicLabels.clear();
    this.emitStatus("disconnected");
  }

  async write(
    channel: string,
    value: number | string | boolean,
  ): Promise<void> {
    if (!this.client || !this.client.connected) {
      throw new Error("MQTT not connected");
    }
    const topic = this.resolveTopic(channel);
    const payload =
      typeof value === "string" ? value : JSON.stringify({ value });
    await new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, payload, { qos: 0 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private resolveTopic(channel: string): string {
    if (this.topicLabels.has(channel)) return channel;
    for (const [topic, label] of this.topicLabels) {
      if (label === channel) return topic;
    }
    // allow ad-hoc publish to a topic the user typed in
    return channel;
  }

  /** Match incoming topic against subscribed patterns (supports + and #). */
  private matchTopic(incoming: string): string | undefined {
    for (const [pattern, label] of this.topicLabels) {
      if (matchMqtt(pattern, incoming)) return label;
    }
    return undefined;
  }

  private parsePayload(text: string): number | string | boolean | null {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    // try JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "number") return parsed;
      if (typeof parsed === "boolean") return parsed;
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object" && "value" in parsed) {
        const v = (parsed as Record<string, unknown>).value;
        if (
          typeof v === "number" ||
          typeof v === "string" ||
          typeof v === "boolean"
        ) {
          return v;
        }
      }
    } catch {
      // not JSON
    }
    // try number
    const n = Number(trimmed);
    if (!Number.isNaN(n) && Number.isFinite(n)) return n;
    return text;
  }
}

/** Standard MQTT topic matching with + (one level) and # (rest). */
function matchMqtt(pattern: string, topic: string): boolean {
  const p = pattern.split("/");
  const t = topic.split("/");
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "#") return true;
    if (t[i] === undefined) return false;
    if (p[i] === "+") continue;
    if (p[i] !== t[i]) return false;
  }
  return p.length === t.length;
}

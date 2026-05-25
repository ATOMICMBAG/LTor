import {
  AttributeIds,
  ClientMonitoredItem,
  ClientSession,
  ClientSubscription,
  DataType,
  MessageSecurityMode,
  OPCUAClient,
  SecurityPolicy,
  TimestampsToReturn,
  UserTokenType,
  type UserIdentityInfo,
} from "node-opcua";
import type { OpcUaConfig, TelemetrySample } from "@shared/types";
import { AdapterEmitter, type ProtocolAdapter } from "./adapter";

export class OpcUaAdapter extends AdapterEmitter implements ProtocolAdapter {
  readonly kind = "opcua" as const;
  private client?: OPCUAClient;
  private session?: ClientSession;
  private subscription?: ClientSubscription;
  private monitored: ClientMonitoredItem[] = [];
  private connected = false;
  /** Maps NodeId string → label so we can emit nice channel names. */
  private nodeLabels = new Map<string, string>();

  constructor(
    public readonly id: string,
    private readonly config: OpcUaConfig,
  ) {
    super();
  }

  async connect(): Promise<void> {
    this.emitStatus("connecting");
    try {
      const securityMode: MessageSecurityMode =
        this.config.securityMode === "Sign" ? MessageSecurityMode.Sign
        : this.config.securityMode === "SignAndEncrypt" ?
          MessageSecurityMode.SignAndEncrypt
        : MessageSecurityMode.None;

      this.client = OPCUAClient.create({
        applicationName: "LTor",
        endpointMustExist: false,
        securityMode,
        securityPolicy:
          securityMode === MessageSecurityMode.None ?
            SecurityPolicy.None
          : SecurityPolicy.Basic256Sha256,
        connectionStrategy: {
          initialDelay: 500,
          maxRetry: 3,
          maxDelay: 5000,
        },
      });

      this.client.on("backoff", (retry, delay) =>
        console.warn(
          `[opcua:${this.id}] backoff retry=${retry} delay=${delay}ms`,
        ),
      );
      this.client.on("connection_lost", () => {
        this.connected = false;
        this.emitStatus("error", "connection lost");
      });

      await this.client.connect(this.config.endpoint);

      const identity: UserIdentityInfo =
        this.config.username && this.config.username.length > 0 ?
          {
            type: UserTokenType.UserName,
            userName: this.config.username,
            password: this.config.password ?? "",
          }
        : { type: UserTokenType.Anonymous };

      this.session = await this.client.createSession(identity);

      this.subscription = ClientSubscription.create(this.session, {
        requestedPublishingInterval: 250,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10,
      });

      this.subscription.on("internal_error", (err) =>
        console.error(`[opcua:${this.id}] subscription error:`, err.message),
      );

      for (const node of this.config.nodes) {
        this.nodeLabels.set(node.nodeId, node.channel);
        const item = ClientMonitoredItem.create(
          this.subscription,
          {
            nodeId: node.nodeId,
            attributeId: AttributeIds.Value,
          },
          {
            samplingInterval: node.samplingInterval ?? 250,
            discardOldest: true,
            queueSize: 10,
          },
          TimestampsToReturn.Both,
        );
        item.on("changed", (dataValue) => {
          const raw = dataValue.value?.value;
          const sample: TelemetrySample = {
            connectionId: this.id,
            channel: node.channel,
            value: this.coerce(raw),
            ts: dataValue.serverTimestamp?.getTime() ?? Date.now(),
          };
          this.emitSample(sample);
        });
        this.monitored.push(item);
      }

      this.connected = true;
      this.emitStatus("connected");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.connected = false;
      await this.cleanup();
      this.emitStatus("error", message);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    await this.cleanup();
    this.emitStatus("disconnected");
  }

  async write(
    channel: string,
    value: number | string | boolean,
  ): Promise<void> {
    if (!this.connected || !this.session) {
      throw new Error("OPC UA not connected");
    }
    // channel can be either a nodeId or a label
    const nodeId = this.resolveNodeId(channel);
    if (!nodeId) {
      throw new Error(`OPC UA channel/node not found: ${channel}`);
    }
    const dataType =
      typeof value === "number" ? DataType.Double
      : typeof value === "boolean" ? DataType.Boolean
      : DataType.String;

    const statusCode = await this.session.write({
      nodeId,
      attributeId: AttributeIds.Value,
      value: {
        value: { dataType, value },
      },
    });
    if (
      statusCode.toString() !== "Good (0x00000000)" &&
      statusCode.name !== "Good"
    ) {
      throw new Error(`OPC UA write failed: ${statusCode.toString()}`);
    }
  }

  private resolveNodeId(channel: string): string | undefined {
    // direct nodeId
    if (this.nodeLabels.has(channel)) return channel;
    // by label
    for (const [nodeId, label] of this.nodeLabels) {
      if (label === channel) return nodeId;
    }
    return undefined;
  }

  private coerce(raw: unknown): number | string | boolean | null {
    if (raw === null || raw === undefined) return null;
    if (
      typeof raw === "number" ||
      typeof raw === "string" ||
      typeof raw === "boolean"
    ) {
      return raw;
    }
    return String(raw);
  }

  private async cleanup(): Promise<void> {
    this.monitored = [];
    try {
      if (this.subscription) {
        await this.subscription.terminate();
        this.subscription = undefined;
      }
    } catch {
      /* ignore */
    }
    try {
      if (this.session) {
        await this.session.close();
        this.session = undefined;
      }
    } catch {
      /* ignore */
    }
    try {
      if (this.client) {
        await this.client.disconnect();
        this.client = undefined;
      }
    } catch {
      /* ignore */
    }
    this.connected = false;
  }
}

import { useState } from "react";
import type {
  Connection,
  ConnectionKind,
  OpcUaConfig,
  MqttConfig,
  RestConfig,
  RestPoll,
  SimConfig,
} from "@shared/types";
import { LASER_MODELS, LASER_MODEL_IDS, type LaserModelId } from "@shared/laserPhysics";
import { Save } from "lucide-react";
import { ipc } from "../../ipc";

interface Props {
  initial: Connection | null;
  kind: ConnectionKind;
  onSaved: (c: Connection) => void;
  onCancel: () => void;
}

function defaultConfig(kind: ConnectionKind): Connection["config"] {
  switch (kind) {
    case "opcua":
      return {
        endpoint: "opc.tcp://localhost:4840",
        securityMode: "None",
        securityPolicy: "None",
        nodes: [
          { nodeId: "ns=2;s=Demo.Static.Scalar.Double", channel: "value" },
        ],
        publishingIntervalMs: 1000,
      } satisfies OpcUaConfig;
    case "mqtt":
      return {
        brokerUrl: "mqtt://localhost:1883",
        clientId: "ltor-" + Math.random().toString(36).slice(2, 8),
        subscriptions: [{ topic: "lab/+/data", channel: "lab" }],
      } satisfies MqttConfig;
    case "rest":
      return {
        baseUrl: "http://localhost:8000",
        method: "GET",
        polling: [{ path: "/api/sensor", intervalMs: 1000, channel: "sensor" }],
      } satisfies RestConfig;
    case "sim":
      return { model: "dpss532", sampleRateHz: 5, noise: 0.3 } satisfies SimConfig;
  }
}

export function ConnectionForm({ initial, kind, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? defaultName(kind));
  const [config, setConfig] = useState<Connection["config"]>(
    initial?.config ?? defaultConfig(kind),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSave() {
    setSaving(true);
    setError(undefined);
    try {
      if (initial) {
        const updated = await ipc.connections.update(initial.id, {
          name,
          config,
        });
        if (updated) onSaved(updated);
      } else {
        const created = await ipc.connections.create({
          name,
          kind,
          config,
        });
        onSaved(created);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
    >
      <div className="text-xs uppercase tracking-wider text-ltor-mute">
        {initial ? "Bearbeiten" : "Neue Verbindung"} ·{" "}
        <span className="font-mono">{kind.toUpperCase()}</span>
      </div>

      <div>
        <label className="label">Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {kind === "opcua" && (
        <OpcUaFields
          value={config as OpcUaConfig}
          onChange={(v) => setConfig(v)}
        />
      )}
      {kind === "mqtt" && (
        <MqttFields
          value={config as MqttConfig}
          onChange={(v) => setConfig(v)}
        />
      )}
      {kind === "rest" && (
        <RestFields
          value={config as RestConfig}
          onChange={(v) => setConfig(v)}
        />
      )}
      {kind === "sim" && (
        <SimFields
          value={config as SimConfig}
          onChange={(v) => setConfig(v)}
        />
      )}

      {error && (
        <div className="text-sm text-ltor-alarm bg-red-50 border border-ltor-alarm/50 p-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-ltor-line">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="btn" disabled={saving}>
          <Save size={14} /> {saving ? "Speichert …" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

function defaultName(kind: ConnectionKind) {
  return (
    {
      opcua: "Neue OPC-UA-Verbindung",
      mqtt: "Neue MQTT-Verbindung",
      rest: "Neue REST-Verbindung",
      sim: "Laserlabor · Simulator",
    } as const
  )[kind];
}

// ---------- OPC UA ----------
function OpcUaFields({
  value,
  onChange,
}: {
  value: OpcUaConfig;
  onChange: (v: OpcUaConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Endpoint (opc.tcp://…)</label>
        <input
          className="input-mono"
          value={value.endpoint}
          onChange={(e) => onChange({ ...value, endpoint: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Security Mode</label>
          <select
            className="input"
            value={value.securityMode ?? "None"}
            onChange={(e) =>
              onChange({
                ...value,
                securityMode: e.target.value as OpcUaConfig["securityMode"],
              })
            }
          >
            <option>None</option>
            <option>Sign</option>
            <option>SignAndEncrypt</option>
          </select>
        </div>
        <div>
          <label className="label">Security Policy</label>
          <select
            className="input"
            value={value.securityPolicy ?? "None"}
            onChange={(e) =>
              onChange({
                ...value,
                securityPolicy: e.target.value as OpcUaConfig["securityPolicy"],
              })
            }
          >
            <option>None</option>
            <option>Basic256Sha256</option>
            <option>Aes128_Sha256_RsaOaep</option>
            <option>Aes256_Sha256_RsaPss</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Benutzer (optional)</label>
          <input
            className="input"
            value={value.username ?? ""}
            onChange={(e) =>
              onChange({ ...value, username: e.target.value || undefined })
            }
          />
        </div>
        <div>
          <label className="label">Passwort (optional)</label>
          <input
            type="password"
            className="input"
            value={value.password ?? ""}
            onChange={(e) =>
              onChange({ ...value, password: e.target.value || undefined })
            }
          />
        </div>
      </div>
      <div>
        <label className="label">Publishing-Intervall (ms)</label>
        <input
          type="number"
          className="input-mono"
          value={value.publishingIntervalMs ?? 1000}
          onChange={(e) =>
            onChange({ ...value, publishingIntervalMs: Number(e.target.value) })
          }
        />
      </div>
      <NodeList
        items={value.nodes.map((n) => `${n.nodeId}|${n.channel}`)}
        placeholder="ns=2;s=Demo.Static.Scalar.Double|temperatur"
        helpText='Format: "nodeId|kanalName" (eine Zeile pro Node).'
        onChange={(rows) =>
          onChange({
            ...value,
            nodes: rows
              .map((r) => {
                const [nodeId, channel] = r.split("|").map((x) => x.trim());
                if (!nodeId || !channel) return null;
                return { nodeId, channel };
              })
              .filter((n): n is { nodeId: string; channel: string } => !!n),
          })
        }
      />
    </div>
  );
}

// ---------- MQTT ----------
function MqttFields({
  value,
  onChange,
}: {
  value: MqttConfig;
  onChange: (v: MqttConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Broker-URL (mqtt:// · mqtts:// · ws://)</label>
        <input
          className="input-mono"
          value={value.brokerUrl}
          onChange={(e) => onChange({ ...value, brokerUrl: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <label className="label">Client-ID</label>
          <input
            className="input-mono"
            value={value.clientId ?? ""}
            onChange={(e) =>
              onChange({ ...value, clientId: e.target.value || undefined })
            }
          />
        </div>
        <div className="col-span-1">
          <label className="label">Benutzer</label>
          <input
            className="input"
            value={value.username ?? ""}
            onChange={(e) =>
              onChange({ ...value, username: e.target.value || undefined })
            }
          />
        </div>
        <div className="col-span-1">
          <label className="label">Passwort</label>
          <input
            type="password"
            className="input"
            value={value.password ?? ""}
            onChange={(e) =>
              onChange({ ...value, password: e.target.value || undefined })
            }
          />
        </div>
      </div>
      <NodeList
        items={value.subscriptions.map(
          (s) => `${s.topic}|${s.channel}|${s.qos ?? 0}`,
        )}
        placeholder="lab/+/temperatur|temperatur|0"
        helpText='Format: "topic|kanalName|qos" pro Zeile.'
        onChange={(rows) =>
          onChange({
            ...value,
            subscriptions: rows
              .map((r) => {
                const [topic, channel, qos] = r.split("|").map((x) => x.trim());
                if (!topic || !channel) return null;
                const q = Number(qos);
                return {
                  topic,
                  channel,
                  qos: q === 1 || q === 2 ? (q as 0 | 1 | 2) : (0 as 0 | 1 | 2),
                };
              })
              .filter(
                (s): s is { topic: string; channel: string; qos: 0 | 1 | 2 } =>
                  !!s,
              ),
          })
        }
      />
    </div>
  );
}

// ---------- REST ----------
function RestFields({
  value,
  onChange,
}: {
  value: RestConfig;
  onChange: (v: RestConfig) => void;
}) {
  const headersText = Object.entries(value.headers ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <div>
          <label className="label">Base-URL</label>
          <input
            className="input-mono"
            value={value.baseUrl}
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">Methode</label>
          <select
            className="input"
            value={value.method ?? "GET"}
            onChange={(e) =>
              onChange({
                ...value,
                method: e.target.value as RestConfig["method"],
              })
            }
          >
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Header (eine pro Zeile, „Key: Value“)</label>
        <textarea
          className="input-mono h-20"
          value={headersText}
          onChange={(e) => {
            const lines = e.target.value
              .split(/\r?\n/)
              .map((l) => l.split(":").map((x) => x.trim()))
              .filter(([k]) => k);
            const headers: Record<string, string> = {};
            for (const [k, ...rest] of lines)
              headers[k] = rest.join(":").trim();
            onChange({
              ...value,
              headers: Object.keys(headers).length ? headers : undefined,
            });
          }}
        />
      </div>
      <NodeList
        items={(value.polling ?? []).map(
          (p) => `${p.path}|${p.channel}|${p.intervalMs}|${p.jsonPath ?? ""}`,
        )}
        placeholder="/api/sensor|temperatur|1000|$.value"
        helpText='Polling: "pfad|kanalName|intervallMs|jsonPath" pro Zeile.'
        onChange={(rows) =>
          onChange({
            ...value,
            polling: rows.flatMap<RestPoll>((r) => {
              const [path, channel, intervalMs, jsonPath] = r
                .split("|")
                .map((x) => x.trim());
              if (!path || !channel) return [];
              const item: RestPoll = {
                path,
                channel,
                intervalMs: Number(intervalMs) || 1000,
              };
              if (jsonPath) item.jsonPath = jsonPath;
              return [item];
            }),
          })
        }
      />
    </div>
  );
}

// ---------- Laser-Simulator ----------
function SimFields({
  value,
  onChange,
}: {
  value: SimConfig;
  onChange: (v: SimConfig) => void;
}) {
  const model = LASER_MODELS[value.model] ?? LASER_MODELS.dpss532;
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Lasermodell</label>
        <select
          className="input"
          value={value.model}
          onChange={(e) =>
            onChange({ ...value, model: e.target.value as LaserModelId })
          }
        >
          {LASER_MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {LASER_MODELS[id].name} · {LASER_MODELS[id].medium}
            </option>
          ))}
        </select>
        <div className="text-[10px] text-ltor-mute mt-1">
          {model.description}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Telemetrie-Rate (Hz)</label>
          <input
            type="number"
            min={1}
            max={10}
            className="input-mono"
            value={value.sampleRateHz ?? 5}
            onChange={(e) =>
              onChange({ ...value, sampleRateHz: Number(e.target.value) })
            }
          />
        </div>
        <div>
          <label className="label">Messrauschen (0 … 1)</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            className="input-mono"
            value={value.noise ?? 0.3}
            onChange={(e) =>
              onChange({ ...value, noise: Number(e.target.value) })
            }
          />
        </div>
      </div>
      <div className="text-[10px] text-ltor-mute">
        Der Simulator öffnet keine Netzwerkverbindung. Bedienung und
        3D-Ansicht im Modul „Laserlabor“; schreibbare Kanäle:
        current_set_mA, tec_set_C, emission, shutter, interlock, fault_reset.
      </div>
    </div>
  );
}

// ---------- Generic editable list ----------
function NodeList({
  items,
  onChange,
  placeholder,
  helpText,
}: {
  items: string[];
  onChange: (rows: string[]) => void;
  placeholder?: string;
  helpText?: string;
}) {
  const [text, setText] = useState(items.join("\n"));
  return (
    <div>
      <label className="label">Datenpunkte / Topics / Endpunkte</label>
      <textarea
        className="input-mono h-32"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean),
          );
        }}
      />
      {helpText && (
        <div className="text-[10px] text-ltor-mute mt-1">{helpText}</div>
      )}
    </div>
  );
}

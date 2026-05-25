import { useConnectionsStore } from "../../store/connectionsStore";
import { useTelemetryStore } from "../../store/telemetryStore";
import { useAuditStore } from "../../store/auditStore";
import { useAppStore } from "../../store/appStore";
import { useSensorsStore } from "../../store/sensorsStore";
import {
  Activity,
  Plug,
  Camera,
  Mic,
  FileText,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "neutral" | "ok" | "warn" | "alarm";
  onClick?: () => void;
}) {
  const toneClass = {
    neutral: "border-ltor-line",
    ok: "border-ltor-ok",
    warn: "border-ltor-warn",
    alarm: "border-ltor-alarm",
  }[tone];

  return (
    <button
      onClick={onClick}
      className={clsx(
        "panel text-left p-4 hover:bg-neutral-50 transition-colors flex flex-col gap-2 border-2",
        toneClass,
      )}
    >
      <div className="flex items-center justify-between text-ltor-mute">
        <span className="text-xs uppercase tracking-wider font-semibold">
          {label}
        </span>
        <Icon size={14} />
      </div>
      <div className="font-mono text-2xl">{value}</div>
      {hint && <div className="text-xs text-ltor-mute">{hint}</div>}
      {onClick && (
        <div className="text-[10px] text-ltor-mute flex items-center gap-1 mt-auto">
          öffnen <ArrowRight size={10} />
        </div>
      )}
    </button>
  );
}

export function DashboardModule() {
  const connections = useConnectionsStore((s) => s.connections);
  const channels = useTelemetryStore((s) => s.channels);
  const auditEntries = useAuditStore((s) => s.entries);
  const setActive = useAppStore((s) => s.setActiveModule);
  const camOn = useSensorsStore((s) => !!s.cameraStream);
  const micOn = useSensorsStore((s) => !!s.microphoneStream);

  const totalConnections = connections.length;
  const connectedCount = connections.filter(
    (c) => c.status === "connected",
  ).length;
  const erroredCount = connections.filter((c) => c.status === "error").length;
  const channelCount = channels.size;

  const recentAlerts = auditEntries
    .filter((e) => e.category === "warning" || e.category === "alarm")
    .slice(0, 5);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Übersicht</h1>
        <p className="text-sm text-ltor-mute mt-1">
          Aktueller Zustand der Plattform und Sensoren.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Verbindungen"
          value={`${connectedCount} / ${totalConnections}`}
          hint={
            erroredCount > 0 ?
              `${erroredCount} mit Fehler`
            : "OPC UA · MQTT · REST"
          }
          icon={Plug}
          tone={
            erroredCount > 0 ? "alarm"
            : connectedCount > 0 ?
              "ok"
            : "neutral"
          }
          onClick={() => setActive("connections")}
        />
        <StatCard
          label="Telemetrie-Kanäle"
          value={String(channelCount)}
          hint="Live-Datenströme"
          icon={Activity}
          tone={channelCount > 0 ? "ok" : "neutral"}
          onClick={() => setActive("telemetry")}
        />
        <StatCard
          label="Kamera"
          value={camOn ? "AKTIV" : "AUS"}
          hint="MediaDevices"
          icon={Camera}
          tone={camOn ? "ok" : "neutral"}
          onClick={() => setActive("sensors")}
        />
        <StatCard
          label="Mikrofon"
          value={micOn ? "AKTIV" : "AUS"}
          hint="MediaDevices"
          icon={Mic}
          tone={micOn ? "ok" : "neutral"}
          onClick={() => setActive("sensors")}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="panel">
          <div className="panel-header">
            <span>Verbindungs-Status</span>
            <button
              className="btn-ghost text-[10px]"
              onClick={() => setActive("connections")}
            >
              Verwalten →
            </button>
          </div>
          <div className="p-2 max-h-80 overflow-auto">
            {connections.length === 0 ?
              <div className="p-4 text-center text-sm text-ltor-mute">
                Noch keine Verbindungen eingerichtet.
                <div className="mt-2">
                  <button
                    className="btn btn-sm"
                    onClick={() => setActive("connections")}
                  >
                    Erste Verbindung anlegen
                  </button>
                </div>
              </div>
            : <table className="w-full text-sm">
                <thead className="text-[10px] uppercase text-ltor-mute">
                  <tr>
                    <th className="text-left px-2 py-1">Name</th>
                    <th className="text-left px-2 py-1">Typ</th>
                    <th className="text-left px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => (
                    <tr key={c.id} className="border-t border-ltor-line">
                      <td className="px-2 py-1.5 truncate">{c.name}</td>
                      <td className="px-2 py-1.5 uppercase text-xs font-mono">
                        {c.kind}
                      </td>
                      <td className="px-2 py-1.5">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="flex items-center gap-1.5">
              <FileText size={12} /> Letzte Warnungen & Alarme
            </span>
            <button
              className="btn-ghost text-[10px]"
              onClick={() => setActive("audit")}
            >
              Audit-Log →
            </button>
          </div>
          <div className="p-2 max-h-80 overflow-auto">
            {recentAlerts.length === 0 ?
              <div className="p-4 text-center text-sm text-ltor-mute">
                Keine Warnungen.
              </div>
            : <ul className="space-y-1">
                {recentAlerts.map((a) => (
                  <li
                    key={a.id}
                    className="px-2 py-1.5 border-l-2 border-ltor-warn bg-neutral-50 text-sm"
                  >
                    <div className="font-mono text-[10px] text-ltor-mute">
                      {new Date(a.ts).toLocaleString("de-DE")}
                    </div>
                    <div className="truncate">{a.action}</div>
                  </li>
                ))}
              </ul>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map = {
    connected: { label: "verbunden", className: "border-ltor-ok text-ltor-ok" },
    connecting: {
      label: "verbindet …",
      className: "border-ltor-warn text-ltor-warn",
    },
    error: { label: "Fehler", className: "border-ltor-alarm text-ltor-alarm" },
    disconnected: {
      label: "getrennt",
      className: "border-ltor-line text-ltor-mute",
    },
  } as const;
  const m =
    (map as Record<string, { label: string; className: string }>)[status] ??
    map.disconnected;
  return (
    <span
      className={clsx("badge font-mono uppercase text-[10px]", m.className)}
    >
      {m.label}
    </span>
  );
}

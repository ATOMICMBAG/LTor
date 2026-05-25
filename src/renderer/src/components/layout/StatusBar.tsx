import {
  ChevronDown,
  Camera,
  Mic,
  Plug,
  AlertTriangle,
  Cpu,
  Globe,
  CloudOff,
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { useConnectionsStore } from "../../store/connectionsStore";
import { useSensorsStore } from "../../store/sensorsStore";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { ipc } from "../../ipc";

function statusColor(s: string): string {
  switch (s) {
    case "connected":
      return "bg-ltor-ok";
    case "connecting":
      return "bg-ltor-warn animate-pulse";
    case "error":
      return "bg-ltor-alarm";
    default:
      return "bg-neutral-300";
  }
}

export function StatusBar() {
  const togglePanel = useAppStore((s) => s.togglePanel);
  const connections = useConnectionsStore((s) => s.connections);
  const camOn = useSensorsStore((s) => !!s.cameraStream);
  const micOn = useSensorsStore((s) => !!s.microphoneStream);
  const micLevel = useSensorsStore((s) => s.micLevel);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const connected = connections.filter((c) => c.status === "connected").length;
  const errored = connections.filter((c) => c.status === "error").length;

  return (
    <footer className="h-9 bg-white border-t border-ltor-line flex items-center justify-between px-3 text-xs font-mono">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-1.5">
          <Plug size={12} />
          <span className="text-ltor-mute">Verbindungen:</span>
          <span>
            {connected}/{connections.length}
          </span>
          {errored > 0 && (
            <span className="text-ltor-alarm flex items-center gap-1">
              <AlertTriangle size={11} /> {errored} Fehler
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Camera
            size={12}
            className={camOn ? "text-ltor-ok" : "text-ltor-mute"}
          />
          <span className="text-ltor-mute">Kamera:</span>
          <span className={camOn ? "text-ltor-ok" : "text-ltor-mute"}>
            {camOn ? "AKTIV" : "AUS"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Mic
            size={12}
            className={micOn ? "text-ltor-ok" : "text-ltor-mute"}
          />
          <span className="text-ltor-mute">Mikro:</span>
          <span className={micOn ? "text-ltor-ok" : "text-ltor-mute"}>
            {micOn ? "AKTIV" : "AUS"}
          </span>
          {micOn && (
            <div className="w-16 h-1.5 bg-neutral-200 overflow-hidden">
              <div
                className="h-full bg-ltor-ok transition-[width] duration-75"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <TransportBadge />
        <div className="flex items-center gap-2 overflow-hidden">
          {connections.slice(0, 4).map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1.5"
              title={c.name}
            >
              <span className={clsx("dot", statusColor(c.status))} />
              <span className="truncate max-w-[120px] text-ltor-mute">
                {c.name}
              </span>
            </div>
          ))}
        </div>
        <span className="text-ltor-mute">
          {now.toLocaleTimeString("de-DE")}
        </span>
        <button
          className="btn-ghost"
          title="Statusleiste einklappen"
          onClick={() => togglePanel("status")}
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </footer>
  );
}

function TransportBadge() {
  const mode = ipc.mode;
  if (mode === "electron") {
    return (
      <span
        className="flex items-center gap-1 text-ltor-mute"
        title="Verbunden mit lokalem Electron-Backend (window.ltor)"
      >
        <Cpu size={11} /> Desktop
      </span>
    );
  }
  if (mode === "websocket") {
    return (
      <span
        className="flex items-center gap-1 text-ltor-mute"
        title="Verbunden mit Remote-Backend über WebSocket"
      >
        <Globe size={11} /> Remote
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-ltor-alarm"
      title="Kein Backend verfügbar – nur Sensoren und Werkzeuge nutzbar"
    >
      <CloudOff size={11} /> Offline
    </span>
  );
}

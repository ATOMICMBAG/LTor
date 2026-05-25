import { useState } from "react";
import {
  Plus,
  Plug,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  Edit,
  X,
} from "lucide-react";
import { useConnectionsStore } from "../../store/connectionsStore";
import { ConnectionForm } from "./ConnectionForm";
import type { Connection, ConnectionKind } from "@shared/types";
import clsx from "clsx";
import { ipc } from "../../ipc";

function statusDot(s: Connection["status"]) {
  return {
    connected: "bg-ltor-ok",
    connecting: "bg-ltor-warn animate-pulse",
    error: "bg-ltor-alarm",
    disconnected: "bg-neutral-300",
  }[s];
}

function statusLabel(s: Connection["status"]) {
  return {
    connected: "verbunden",
    connecting: "verbindet …",
    error: "Fehler",
    disconnected: "getrennt",
  }[s];
}

export function ConnectionsModule() {
  const connections = useConnectionsStore((s) => s.connections);
  const refresh = useConnectionsStore((s) => s.refresh);
  const remove = useConnectionsStore((s) => s.remove);
  const upsert = useConnectionsStore((s) => s.upsert);

  const [editing, setEditing] = useState<Connection | "new" | null>(null);
  const [newKind, setNewKind] = useState<ConnectionKind>("opcua");
  const [busy, setBusy] = useState<string | null>(null);

  async function handleConnect(id: string) {
    setBusy(id);
    try {
      await ipc.connections.connect(id);
    } finally {
      setBusy(null);
    }
  }
  async function handleDisconnect(id: string) {
    setBusy(id);
    try {
      await ipc.connections.disconnect(id);
    } finally {
      setBusy(null);
    }
  }
  async function handleDelete(id: string) {
    if (!confirm("Verbindung wirklich löschen?")) return;
    await ipc.connections.delete(id);
    remove(id);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Verbindungen
          </h1>
          <p className="text-sm text-ltor-mute mt-1">
            OPC UA, MQTT und REST-Geräte verwalten und steuern.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost"
            title="Neu laden"
            onClick={() => refresh()}
          >
            <RefreshCw size={14} />
          </button>
          <div className="flex">
            <select
              className="input input-mono text-xs h-[34px] rounded-none border-r-0"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ConnectionKind)}
            >
              <option value="opcua">OPC UA</option>
              <option value="mqtt">MQTT</option>
              <option value="rest">REST</option>
            </select>
            <button className="btn" onClick={() => setEditing("new")}>
              <Plus size={14} /> Neu
            </button>
          </div>
        </div>
      </div>

      {connections.length === 0 ?
        <div className="panel p-8 text-center text-sm text-ltor-mute">
          <Plug size={28} className="mx-auto mb-3 opacity-40" />
          Noch keine Verbindungen. Wähle oben einen Protokoll-Typ und klicke{" "}
          <span className="kbd">Neu</span>.
        </div>
      : <div className="panel">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-ltor-mute">
              <tr>
                <th className="text-left px-3 py-2 w-8"></th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2 w-24">Typ</th>
                <th className="text-left px-3 py-2 w-32">Status</th>
                <th className="text-left px-3 py-2">Endpoint</th>
                <th className="text-right px-3 py-2 w-48">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => {
                const isConnected =
                  c.status === "connected" || c.status === "connecting";
                return (
                  <tr key={c.id} className="border-t border-ltor-line">
                    <td className="px-3 py-2">
                      <span className={clsx("dot", statusDot(c.status))} />
                    </td>
                    <td className="px-3 py-2 font-medium truncate">{c.name}</td>
                    <td className="px-3 py-2 font-mono text-xs uppercase">
                      {c.kind}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{statusLabel(c.status)}</div>
                      {c.lastError && (
                        <div
                          className="text-ltor-alarm text-[10px] truncate max-w-[180px]"
                          title={c.lastError}
                        >
                          {c.lastError}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ltor-mute truncate max-w-[260px]">
                      {endpointSummary(c)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {isConnected ?
                          <button
                            className="btn btn-sm"
                            onClick={() => handleDisconnect(c.id)}
                            disabled={busy === c.id}
                          >
                            <PowerOff size={12} /> Trennen
                          </button>
                        : <button
                            className="btn btn-sm"
                            onClick={() => handleConnect(c.id)}
                            disabled={busy === c.id}
                          >
                            <Power size={12} /> Verbinden
                          </button>
                        }
                        <button
                          className="btn-ghost"
                          title="Bearbeiten"
                          onClick={() => setEditing(c)}
                        >
                          <Edit size={12} />
                        </button>
                        <button
                          className="btn-ghost text-ltor-alarm"
                          title="Löschen"
                          onClick={() => handleDelete(c.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <ConnectionForm
            initial={editing === "new" ? null : editing}
            kind={editing === "new" ? newKind : editing.kind}
            onSaved={(c) => {
              upsert(c);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function endpointSummary(c: Connection): string {
  switch (c.kind) {
    case "opcua":
      return (c.config as { endpoint: string }).endpoint;
    case "mqtt":
      return (c.config as { brokerUrl: string }).brokerUrl;
    case "rest":
      return (c.config as { baseUrl: string }).baseUrl;
    default:
      return "";
  }
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white border border-ltor-line w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-ltor-line">
          <span className="text-xs uppercase tracking-wider font-semibold text-ltor-mute">
            Verbindung
          </span>
          <button className="btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

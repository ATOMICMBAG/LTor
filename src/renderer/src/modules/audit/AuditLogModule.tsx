import { useMemo, useState } from "react";
import { useAuditStore } from "../../store/auditStore";
import { FileText, RefreshCw, Trash2, Download } from "lucide-react";
import type { AuditCategory, AuditEntry } from "@shared/types";
import clsx from "clsx";

const CATEGORIES: { value: AuditCategory; label: string; color: string }[] = [
  {
    value: "system",
    label: "System",
    color: "border-ltor-line text-ltor-mute",
  },
  {
    value: "connection",
    label: "Verbindung",
    color: "border-ltor-line text-ltor-ink",
  },
  {
    value: "telemetry",
    label: "Telemetrie",
    color: "border-ltor-line text-ltor-ink",
  },
  { value: "sensor", label: "Sensor", color: "border-ltor-line text-ltor-ink" },
  { value: "user", label: "Benutzer", color: "border-ltor-line text-ltor-ink" },
  {
    value: "warning",
    label: "Warnung",
    color: "border-ltor-warn text-ltor-warn",
  },
  {
    value: "alarm",
    label: "Alarm",
    color: "border-ltor-alarm text-ltor-alarm",
  },
];

export function AuditLogModule() {
  const entries = useAuditStore((s) => s.entries);
  const refresh = useAuditStore((s) => s.refresh);
  const clear = useAuditStore((s) => s.clear);

  const [filter, setFilter] = useState("");
  const [active, setActive] = useState<Set<AuditCategory>>(
    () => new Set(CATEGORIES.map((c) => c.value)),
  );

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return entries.filter((e) => {
      if (!active.has(e.category)) return false;
      if (!f) return true;
      return (
        e.action.toLowerCase().includes(f) ||
        JSON.stringify(e.details ?? {})
          .toLowerCase()
          .includes(f)
      );
    });
  }, [entries, filter, active]);

  function toggle(cat: AuditCategory) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function exportJsonl() {
    const blob = new Blob([filtered.map((e) => JSON.stringify(e)).join("\n")], {
      type: "application/x-ndjson",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ltor-audit-${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleClear() {
    if (!confirm("Audit-Log wirklich vollständig löschen?")) return;
    await clear();
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit-Log</h1>
          <p className="text-sm text-ltor-mute mt-1">
            Lückenlose Protokollierung aller Ereignisse (JSONL).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost"
            title="Neu laden"
            onClick={() => void refresh(1000)}
          >
            <RefreshCw size={14} />
          </button>
          <button
            className="btn-ghost"
            title="Exportieren"
            onClick={exportJsonl}
          >
            <Download size={14} />
          </button>
          <button
            className="btn-ghost text-ltor-alarm"
            title="Log löschen"
            onClick={() => void handleClear()}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="panel p-3 flex flex-wrap items-center gap-2">
        <input
          className="input text-xs h-[30px] flex-1 min-w-[200px]"
          placeholder="Suche in Aktion / Details …"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => {
            const on = active.has(c.value);
            return (
              <button
                key={c.value}
                onClick={() => toggle(c.value)}
                className={clsx(
                  "badge font-mono uppercase text-[10px] transition-opacity",
                  c.color,
                  on ? "opacity-100" : "opacity-30",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ?
        <div className="panel p-8 text-center text-sm text-ltor-mute">
          <FileText size={28} className="mx-auto mb-3 opacity-40" />
          Keine Einträge im aktuellen Filter.
        </div>
      : <div className="panel">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-ltor-mute">
              <tr>
                <th className="text-left px-3 py-2 w-40">Zeit</th>
                <th className="text-left px-3 py-2 w-28">Kategorie</th>
                <th className="text-left px-3 py-2 w-16">Akteur</th>
                <th className="text-left px-3 py-2">Aktion</th>
                <th className="text-left px-3 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div className="p-2 text-center text-[10px] text-ltor-mute border-t border-ltor-line">
              … {filtered.length - 500} weitere ausgeblendet (Export für
              vollständige Daten verwenden)
            </div>
          )}
        </div>
      }
    </div>
  );
}

function EntryRow({ entry }: { entry: AuditEntry }) {
  const cat = CATEGORIES.find((c) => c.value === entry.category);
  return (
    <tr className="border-t border-ltor-line align-top">
      <td className="px-3 py-1.5 font-mono text-[11px] text-ltor-mute whitespace-nowrap">
        {new Date(entry.ts).toLocaleString("de-DE")}
      </td>
      <td className="px-3 py-1.5">
        <span
          className={clsx(
            "badge font-mono uppercase text-[10px]",
            cat?.color ?? "border-ltor-line text-ltor-mute",
          )}
        >
          {cat?.label ?? entry.category}
        </span>
      </td>
      <td className="px-3 py-1.5 font-mono text-[11px]">{entry.actor}</td>
      <td className="px-3 py-1.5">{entry.action}</td>
      <td className="px-3 py-1.5 font-mono text-[10px] text-ltor-mute">
        {entry.details ?
          <code
            className="block max-w-md truncate"
            title={JSON.stringify(entry.details)}
          >
            {JSON.stringify(entry.details)}
          </code>
        : null}
      </td>
    </tr>
  );
}

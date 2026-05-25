import { useMemo, useState } from "react";
import { useTelemetryStore } from "../../store/telemetryStore";
import { useConnectionsStore } from "../../store/connectionsStore";
import { Activity, Pause, Play, Trash2 } from "lucide-react";

export function TelemetryModule() {
  const channels = useTelemetryStore((s) => s.channels);
  const clear = useTelemetryStore((s) => s.clear);
  const connections = useConnectionsStore((s) => s.connections);

  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");

  const keys = useMemo(() => {
    const all = Array.from(channels.keys()).sort();
    if (!filter) return all;
    const f = filter.toLowerCase();
    return all.filter((k) => k.toLowerCase().includes(f));
  }, [channels, filter]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Telemetrie</h1>
          <p className="text-sm text-ltor-mute mt-1">
            Live-Datenströme aller verbundenen Geräte ({keys.length} Kanäle).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="input text-xs h-[32px]"
            placeholder="Kanal filtern …"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            className="btn-ghost"
            title={paused ? "Fortsetzen" : "Pausieren"}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ?
              <Play size={14} />
            : <Pause size={14} />}
          </button>
          <button
            className="btn-ghost text-ltor-alarm"
            title="Verlauf leeren"
            onClick={() => clear()}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {keys.length === 0 ?
        <div className="panel p-8 text-center text-sm text-ltor-mute">
          <Activity size={28} className="mx-auto mb-3 opacity-40" />
          Noch keine Telemetrie-Daten. Verbinde ein Gerät unter „Verbindungen“.
        </div>
      : <div className="grid md:grid-cols-2 gap-3">
          {keys.map((key) => {
            const series = channels.get(key);
            if (!series) return null;
            const conn = connections.find((c) => c.id === series.connectionId);
            return (
              <ChannelCard
                key={key}
                title={`${conn?.name ?? series.connectionId} · ${series.channel}`}
                samples={series.samples}
                paused={paused}
              />
            );
          })}
        </div>
      }
    </div>
  );
}

interface Sample {
  ts: number;
  value: number | string | boolean | null;
}

function ChannelCard({
  title,
  samples,
  paused,
}: {
  title: string;
  samples: Sample[];
  paused: boolean;
}) {
  const last = samples[samples.length - 1];
  const numericSeries = samples
    .filter(
      (s): s is { ts: number; value: number } => typeof s.value === "number",
    )
    .slice(-120);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="truncate">{title}</span>
        <span className="font-mono text-ltor-mute">
          {samples.length} Samples
        </span>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl">{formatValue(last?.value)}</span>
          {last && (
            <span className="text-[10px] text-ltor-mute font-mono">
              {new Date(last.ts).toLocaleTimeString("de-DE")}
            </span>
          )}
          {paused && (
            <span className="badge border-ltor-warn text-ltor-warn">PAUSE</span>
          )}
        </div>
        {numericSeries.length > 1 && <Sparkline data={numericSeries} />}
      </div>
    </div>
  );
}

function formatValue(v: number | string | boolean | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number")
    return v.toLocaleString("de-DE", {
      maximumFractionDigits: 4,
    });
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function Sparkline({ data }: { data: { ts: number; value: number }[] }) {
  const w = 320;
  const h = 60;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.value - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="bg-neutral-50 border border-ltor-line p-1">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-14"
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-ltor-ok"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-ltor-mute font-mono px-1">
        <span>min {formatValue(min)}</span>
        <span>max {formatValue(max)}</span>
      </div>
    </div>
  );
}

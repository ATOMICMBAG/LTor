import { useEffect, useRef, useState } from "react";
import type { TelemetrySample } from "@shared/types";
import { ipc } from "../../ipc";

export type SimValues = Record<string, TelemetrySample["value"]>;

export interface SimFrame {
  values: SimValues;
  /** Recent operating points for the P–I chart trail. */
  trail: { currentmA: number; powerMw: number }[];
  /** Timestamp of the newest sample (0 = nothing received yet). */
  ts: number;
}

const FLUSH_MS = 200;
const TRAIL_LEN = 40;

/**
 * Collects the simulator telemetry of one connection and hands it to React
 * in batches (instead of re-rendering for every single channel sample).
 */
export function useSimFrame(connectionId: string | undefined): SimFrame {
  const [frame, setFrame] = useState<SimFrame>({ values: {}, trail: [], ts: 0 });
  const values = useRef<SimValues>({});
  const trail = useRef<SimFrame["trail"]>([]);
  const ts = useRef(0);
  const dirty = useRef(false);

  useEffect(() => {
    values.current = {};
    trail.current = [];
    ts.current = 0;
    setFrame({ values: {}, trail: [], ts: 0 });
    if (!connectionId) return;

    const off = ipc.connections.onTelemetry((s) => {
      if (s.connectionId !== connectionId) return;
      values.current[s.channel] = s.value;
      ts.current = s.ts;
      dirty.current = true;
      if (s.channel === "laser_power_mW") {
        const i = values.current["current_mA"];
        if (typeof i === "number" && typeof s.value === "number") {
          trail.current.push({ currentmA: i, powerMw: s.value });
          if (trail.current.length > TRAIL_LEN) trail.current.shift();
        }
      }
    });
    const timer = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setFrame({
        values: { ...values.current },
        trail: trail.current.slice(),
        ts: ts.current,
      });
    }, FLUSH_MS);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [connectionId]);

  return frame;
}

export function num(v: SimValues, key: string, fallback = 0): number {
  const x = v[key];
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

export function bool(v: SimValues, key: string, fallback = false): boolean {
  const x = v[key];
  return typeof x === "boolean" ? x : fallback;
}

export function str(v: SimValues, key: string, fallback = ""): string {
  const x = v[key];
  return typeof x === "string" ? x : fallback;
}

import { useEffect, useMemo, useRef } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  piCurve,
  radiusAt,
  type BeamSegment,
  type LaserModel,
} from "@shared/laserPhysics";

const INK = "#0a0a0a";
const MUTE = "#a3a3a3";

function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

// ---------------------------------------------------------------------------
// P–I characteristic
// ---------------------------------------------------------------------------

export function PiChart(props: {
  model: LaserModel;
  tecC: number;
  currentmA: number;
  powerMw: number;
  thresholdmA: number;
  trail: { currentmA: number; powerMw: number }[];
}) {
  const { model, tecC } = props;
  const data = useMemo(() => {
    const now = piCurve(model, tecC, 80);
    const cold = piCurve(model, Math.max(10, tecC - 10), 80);
    const warm = piCurve(model, Math.min(40, tecC + 10), 80);
    return now.map((p, k) => ({
      currentmA: Math.round(p.currentmA * 10) / 10,
      now: p.powerMw,
      cold: cold[k].powerMw,
      warm: warm[k].powerMw,
    }));
  }, [model, tecC]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[10px] text-ltor-mute px-1">
        <span>P–I-Kennlinie (stationär, inkl. Eigenerwärmung)</span>
        <span className="font-mono">
          — {fmt(tecC, 0)} °C · <span style={{ color: "#2563eb" }}>{fmt(Math.max(10, tecC - 10), 0)} °C</span> ·{" "}
          <span style={{ color: "#dc2626" }}>{fmt(Math.min(40, tecC + 10), 0)} °C</span>
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 4 }}>
            <CartesianGrid strokeDasharray="2 4" />
            <XAxis
              dataKey="currentmA"
              type="number"
              domain={[0, model.maxCurrentmA]}
              tickCount={6}
              label={{ value: "Strom I [mA]", position: "insideBottom", offset: -10, fontSize: 10, fill: "#737373" }}
            />
            <YAxis
              width={48}
              label={{ value: "P [mW]", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "#737373" }}
            />
            <Tooltip
              formatter={(v: number) => `${v.toFixed(2)} mW`}
              labelFormatter={(l: number) => `I = ${l} mA`}
              contentStyle={{ fontSize: 11, fontFamily: "monospace" }}
            />
            <Line dataKey="cold" stroke="#2563eb" strokeOpacity={0.45} dot={false} strokeWidth={1} isAnimationActive={false} name="kälter" />
            <Line dataKey="warm" stroke="#dc2626" strokeOpacity={0.45} dot={false} strokeWidth={1} isAnimationActive={false} name="wärmer" />
            <Line dataKey="now" stroke={INK} dot={false} strokeWidth={2} isAnimationActive={false} name="aktuell" />
            <Scatter
              data={props.trail.map((t) => ({ currentmA: t.currentmA, trail: t.powerMw }))}
              dataKey="trail"
              fill={MUTE}
              isAnimationActive={false}
              shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={1.6} fill={MUTE} />}
            />
            <ReferenceLine
              x={props.thresholdmA}
              stroke="#ca8a04"
              strokeDasharray="4 3"
              label={{ value: "I_th", position: "top", fontSize: 10, fill: "#ca8a04" }}
            />
            <ReferenceDot x={props.currentmA} y={props.powerMw} r={5} fill="#16a34a" stroke="white" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beam caustic w(z)
// ---------------------------------------------------------------------------

export function CausticChart(props: {
  segments: BeamSegment[];
  zEnd: number;
  /** Lens positions [m], in order along the bench. */
  lensZs: number[];
  planeZ: number;
}) {
  const data = useMemo(() => {
    const n = 320;
    const out: { z: number; w: number }[] = [];
    for (let k = 0; k <= n; k++) {
      const z = (props.zEnd * k) / n;
      out.push({ z: Math.round(z * 1e4) / 10, w: radiusAt(props.segments, z) * 1e6 });
    }
    // add exact waist points so the minimum is not missed by sampling
    for (const s of props.segments) {
      if (s.zWaist > s.zStart && s.zWaist < s.zEnd) {
        out.push({ z: Math.round(s.zWaist * 1e4) / 10, w: s.w0 * 1e6 });
      }
    }
    return out.sort((a, b) => a.z - b.z);
  }, [props.segments, props.zEnd]);

  const wPlane = radiusAt(props.segments, props.planeZ) * 1e6;

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[10px] text-ltor-mute px-1">
        <span>Kaustik: Strahlradius w(z) (1/e²), logarithmisch</span>
        <span className="font-mono">w(Messebene) = {fmt(wPlane, 1)} µm</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 4 }}>
            <CartesianGrid strokeDasharray="2 4" />
            <XAxis
              dataKey="z"
              type="number"
              domain={[0, props.zEnd * 1000]}
              tickCount={7}
              label={{ value: "z ab Apertur [mm]", position: "insideBottom", offset: -10, fontSize: 10, fill: "#737373" }}
            />
            <YAxis
              scale="log"
              domain={["auto", "auto"]}
              allowDataOverflow
              width={48}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))}
              label={{ value: "w [µm]", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "#737373" }}
            />
            <Tooltip
              formatter={(v: number) => `${v.toFixed(1)} µm`}
              labelFormatter={(l: number) => `z = ${l} mm`}
              contentStyle={{ fontSize: 11, fontFamily: "monospace" }}
            />
            <Line dataKey="w" stroke={INK} dot={false} strokeWidth={2} isAnimationActive={false} />
            {props.lensZs.map((z, i) => (
              <ReferenceLine
                key={i}
                x={z * 1000}
                stroke="#737373"
                label={{ value: `L${i + 1}`, position: "top", fontSize: 10, fill: "#737373" }}
              />
            ))}
            <ReferenceLine
              x={props.planeZ * 1000}
              stroke="#2563eb"
              strokeDasharray="4 3"
              label={{ value: "Messebene", position: "insideTopRight", fontSize: 10, fill: "#2563eb" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beam profile camera at the measurement plane
// ---------------------------------------------------------------------------

/** "Inferno"-like colour map, t ∈ [0, 1]. */
function colormap(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0, 0, 0, 4],
    [0.25, 87, 16, 110],
    [0.5, 188, 55, 84],
    [0.75, 249, 142, 9],
    [1, 252, 255, 164],
  ];
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [t0, r0, g0, b0] = stops[k - 1];
      const [t1, r1, g1, b1] = stops[k];
      const f = (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [252, 255, 164];
}

export function BeamProfile(props: {
  /** Beam radius w at the plane [m]. */
  w: number;
  /** Power reaching the plane [W]. */
  powerW: number;
  m2: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const window_ = 4 * props.w; // full image width = 4·w
  const peak = props.powerW > 0 ? (2 * props.powerW) / (Math.PI * props.w * props.w) : 0;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const n = c.width;
    const img = ctx.createImageData(n, n);
    const on = props.powerW > 1e-7;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const rx = ((x + 0.5) / n - 0.5) * 4; // in units of w
        const ry = ((y + 0.5) / n - 0.5) * 4;
        const i = on ? Math.exp(-2 * (rx * rx + ry * ry)) : 0;
        const noise = (Math.random() - 0.5) * 0.015;
        const [r, g, b] = colormap(Math.min(1, Math.max(0, i + noise)));
        const o = (y * n + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 1/e² circle (radius = w = quarter of the image width)
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(n / 2, n / 2, n / 4, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [props.w, props.powerW]);

  return (
    <div className="h-full flex flex-col">
      <div className="text-[10px] text-ltor-mute px-1">Strahlprofil an der Messebene</div>
      <div className="flex-1 min-h-0 flex gap-3 items-center px-1">
        <canvas ref={canvas} width={128} height={128} className="w-[110px] h-[110px] 2xl:w-[150px] 2xl:h-[150px] shrink-0 border border-ltor-line" />
        <div className="text-[11px] font-mono space-y-0.5 min-w-0 flex-1 break-words">
          <div>
            <span className="text-ltor-mute">w (1/e²) </span>
            {props.w < 1e-3 ? `${fmt(props.w * 1e6, 1)} µm` : `${fmt(props.w * 1e3, 2)} mm`}
          </div>
          <div>
            <span className="text-ltor-mute">Bildbreite </span>
            {window_ < 1e-3 ? `${fmt(window_ * 1e6, 0)} µm` : `${fmt(window_ * 1e3, 2)} mm`}
          </div>
          <div>
            <span className="text-ltor-mute">I₀ </span>
            {peak > 0 ? `${(peak / 1e4).toExponential(2)} W/cm²` : "kein Signal"}
          </div>
          <div className="text-ltor-mute leading-tight pt-1 font-sans text-[10px]">
            I(r) = I₀·e<sup>−2r²/w²</sup>
            {props.m2 > 1.5 && " · M² > 1: reales Profil weicht vom idealen Gauß ab (eingebetteter Gaußstrahl)"}
          </div>
        </div>
      </div>
    </div>
  );
}

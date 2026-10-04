import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  DoorClosed,
  DoorOpen,
  KeyRound,
  Aperture,
  RotateCcw,
  ShieldAlert,
  Info,
} from "lucide-react";
import {
  CLASS_INFO,
} from "./knowledge";
import {
  laserClass,
  mpeEyeWpm2,
  nohdM,
  requiredOD,
  divergence,
  isVisible,
  type LaserModel,
} from "@shared/laserPhysics";
import type { SimWriteChannel } from "@shared/types";
import type { SimValues } from "./useSimFrame";
import { bool, num, str } from "./useSimFrame";

export type WriteFn = (channel: SimWriteChannel, value: number | boolean) => void;

export function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
}

/** Power with a sensible unit. */
export function fmtPower(mw: number): string {
  if (!Number.isFinite(mw)) return "—";
  if (mw >= 1000) return `${fmt(mw / 1000, 3)} W`;
  if (mw >= 1) return `${fmt(mw, 2)} mW`;
  return `${fmt(mw * 1000, 1)} µW`;
}

export function Panel(props: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("panel flex flex-col", props.className)}>
      <div className="panel-header">
        <span className="flex items-center gap-1.5">{props.title}</span>
        {props.right}
      </div>
      <div className="p-3 flex-1 min-h-0">{props.children}</div>
    </section>
  );
}

const STATE_STYLE: Record<string, { label: string; cls: string }> = {
  OFF: { label: "AUS", cls: "bg-neutral-100 text-ltor-mute border-ltor-line" },
  ARMING: { label: "VERZÖGERUNG", cls: "bg-amber-50 text-ltor-warn border-ltor-warn animate-pulse" },
  ON: { label: "EIN · UNTER SCHWELLE", cls: "bg-amber-50 text-ltor-warn border-ltor-warn" },
  LASING: { label: "LASERBETRIEB", cls: "bg-red-50 text-ltor-alarm border-ltor-alarm" },
  INTERLOCK: { label: "INTERLOCK OFFEN", cls: "bg-neutral-900 text-white border-neutral-900" },
  FAULT: { label: "STÖRUNG", cls: "bg-ltor-alarm text-white border-ltor-alarm" },
};

export function StateBadge({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? { label: state || "—", cls: "bg-white text-ltor-mute border-ltor-line" };
  return <span className={clsx("inline-flex px-2 py-0.5 text-[11px] font-mono font-semibold border", s.cls)}>{s.label}</span>;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

function Toggle(props: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  icon: ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={clsx(
        "flex-1 flex flex-col items-center gap-1 py-2 border text-xs transition-colors disabled:opacity-40",
        props.on ?
          props.danger ? "bg-ltor-alarm text-white border-ltor-alarm" : "bg-ltor-ink text-white border-ltor-ink"
        : "bg-white text-ltor-ink border-ltor-line hover:border-ltor-ink",
      )}
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.icon}
      <span className="font-mono text-[10px] uppercase tracking-wider">{props.on ? props.onLabel : props.offLabel}</span>
    </button>
  );
}

/** Slider + number input that sends throttled writes and follows telemetry otherwise. */
function SetpointSlider(props: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  actual: number;
  setpoint: number;
  digits: number;
  onCommit: (v: number) => void;
  hint?: ReactNode;
}) {
  const [local, setLocal] = useState(props.setpoint);
  const touched = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Date.now() - touched.current > 1200) setLocal(props.setpoint);
  }, [props.setpoint]);

  function change(v: number) {
    const clamped = Math.min(props.max, Math.max(props.min, v));
    setLocal(clamped);
    touched.current = Date.now();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => props.onCommit(clamped), 150);
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="label mb-0">{props.label}</label>
        <span className="text-[10px] font-mono text-ltor-mute">
          Ist {fmt(props.actual, props.digits)} {props.unit}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="range"
          className="flex-1 accent-neutral-900"
          min={props.min}
          max={props.max}
          step={props.step}
          value={local}
          onChange={(e) => change(Number(e.target.value))}
        />
        <button className="btn-ghost px-1 text-xs font-mono" title="−1 Schritt" onClick={() => change(local - props.step)}>
          −
        </button>
        <input
          type="number"
          className="input-mono text-xs w-20 py-1"
          min={props.min}
          max={props.max}
          step={props.step}
          value={Number(local.toFixed(props.digits))}
          onChange={(e) => change(Number(e.target.value))}
        />
        <button className="btn-ghost px-1 text-xs font-mono" title="+1 Schritt" onClick={() => change(local + props.step)}>
          +
        </button>
        <span className="text-[11px] font-mono text-ltor-mute w-6">{props.unit}</span>
      </div>
      {props.hint && <div className="text-[10px] text-ltor-mute mt-0.5">{props.hint}</div>}
    </div>
  );
}

export function ControlPanel(props: { model: LaserModel; v: SimValues; write: WriteFn; connected: boolean }) {
  const { model, v, write } = props;
  const interlock = bool(v, "interlock", true);
  const emission = bool(v, "emission");
  const shutter = bool(v, "shutter");
  const fault = str(v, "fault");
  const step = model.maxCurrentmA >= 1000 ? 5 : model.maxCurrentmA >= 400 ? 1 : 0.5;
  const dis = !props.connected;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Toggle
          on={interlock}
          onLabel="Interlock zu"
          offLabel="Interlock offen"
          icon={interlock ? <DoorClosed size={16} /> : <DoorOpen size={16} />}
          title="Interlock (z. B. Labortür-Kontakt) öffnen/schließen"
          onClick={() => write("interlock", !interlock)}
          disabled={dis}
        />
        <Toggle
          on={emission}
          onLabel="Emission frei"
          offLabel="Emission aus"
          icon={<KeyRound size={16} />}
          title="Schlüsselschalter: Emission freigeben/sperren"
          onClick={() => write("emission", !emission)}
          danger
          disabled={dis}
        />
        <Toggle
          on={shutter}
          onLabel="Shutter offen"
          offLabel="Shutter zu"
          icon={<Aperture size={16} />}
          title="Shutter öffnen/schließen"
          onClick={() => write("shutter", !shutter)}
          danger
          disabled={dis}
        />
      </div>
      {fault && (
        <div className="flex items-center justify-between gap-2 p-2 border border-ltor-alarm bg-red-50 text-xs text-ltor-alarm">
          <span className="flex items-center gap-1">
            <ShieldAlert size={14} /> Störung: {fault}
          </span>
          <button className="btn btn-sm" onClick={() => write("fault_reset", true)}>
            <RotateCcw size={12} /> Quittieren
          </button>
        </div>
      )}
      <SetpointSlider
        label={model.kind === "dpss" ? "Pumpstrom (808-nm-Diode)" : "Diodenstrom"}
        unit="mA"
        min={0}
        max={model.maxCurrentmA}
        step={step}
        digits={step < 1 ? 1 : 0}
        actual={num(v, "current_mA")}
        setpoint={num(v, "current_set_mA")}
        onCommit={(x) => write("current_set_mA", x)}
        hint={<>Soft-Start: Der Treiber rampt den Strom, I_max = {model.maxCurrentmA} mA.</>}
      />
      <SetpointSlider
        label="TEC-Solltemperatur"
        unit="°C"
        min={10}
        max={40}
        step={0.5}
        digits={1}
        actual={num(v, "case_C", 22)}
        setpoint={num(v, "tec_set_C", 25)}
        onCommit={(x) => write("tec_set_C", x)}
        hint={<>Sperrschicht T_j = T_TEC + R_th·P_Wärme (R_th = {model.rthKpW} K/W). Abschaltung bei {model.maxJunctionC} °C.</>}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

function Readout(props: { label: string; value: string; sub?: string; strong?: boolean; title?: string }) {
  return (
    <div className="border border-ltor-line px-2 py-1.5 min-w-0" title={props.title}>
      <div className="text-[10px] text-ltor-mute truncate">{props.label}</div>
      <div className={clsx("font-mono truncate", props.strong ? "text-base font-semibold" : "text-sm")}>{props.value}</div>
      {props.sub && <div className="text-[10px] font-mono text-ltor-mute truncate">{props.sub}</div>}
    </div>
  );
}

export function Readouts({ model, v }: { model: LaserModel; v: SimValues }) {
  const pel = num(v, "electrical_W");
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <Readout label="Leistungsmesser" value={fmtPower(num(v, "power_mW"))} strong title="Gemessen hinter Shutter und Optik" />
      <Readout label="Laserleistung (intern)" value={fmtPower(num(v, "laser_power_mW"))} title="Vor dem Shutter" />
      <Readout label="Wellenlänge λ" value={`${fmt(num(v, "wavelength_nm", model.wavelengthNm), 2)} nm`} sub={isVisible(model.wavelengthNm) ? "sichtbar" : "unsichtbar (IR)"} />
      <Readout label="Strom I" value={`${fmt(num(v, "current_mA"), 1)} mA`} sub={`Schwelle ${fmt(num(v, "threshold_mA"), 0)} mA`} />
      <Readout label="Spannung U" value={`${fmt(num(v, "voltage_V"), 3)} V`} sub={`P_el ${fmt(pel, 3)} W`} />
      <Readout label="Wirkungsgrad η" value={`${fmt(num(v, "efficiency_pct"), 1)} %`} title="Wall-Plug: P_opt / P_el" sub="P_opt / P_el" />
      <Readout label="Sperrschicht T_j" value={`${fmt(num(v, "junction_C", 22), 1)} °C`} sub={`TEC ${fmt(num(v, "case_C", 22), 1)} °C`} />
      {model.dpss ?
        <>
          <Readout label="Pump-λ" value={`${fmt(num(v, "pump_wavelength_nm"), 2)} nm`} sub={`Linie ${model.dpss.absorptionPeakNm} nm`} />
          <Readout label="Absorption" value={`${fmt(num(v, "absorption_pct"), 1)} %`} sub={model.dpss.shgCoeffPerW ? `1064 nm: ${fmtPower(num(v, "fundamental_mW"))}` : `Pumpe: ${fmtPower(num(v, "diode_power_mW"))}`} />
        </>
      : <>
          <Readout label="dλ/dT" value={`${fmt(model.dLambdaDT, 2)} nm/K`} sub={`T₀ = ${model.t0K} K`} />
          <Readout label="Steilheit" value={`${fmt(model.slopeWpA, 2)} W/A`} sub="bei 25 °C" />
        </>
      }
    </div>
  );
}

// ---------------------------------------------------------------------------
// Laser safety
// ---------------------------------------------------------------------------

export function SafetyPanel(props: { model: LaserModel; powerMw: number; lambdaNm: number }) {
  const { model } = props;
  const lambda = props.lambdaNm;
  const w0 = model.beam.w0Mm * 1e-3;
  const theta = divergence(w0, lambda * 1e-9, model.beam.m2);
  const deviceClass = laserClass(model.ratedPowerMw / 1000, lambda);
  const nowClass = laserClass(props.powerMw / 1000, lambda);
  const mpe = mpeEyeWpm2(lambda);
  const nohdRated = nohdM(model.ratedPowerMw / 1000, lambda, 2 * w0, 2 * theta);
  const nohdNow = nohdM(props.powerMw / 1000, lambda, 2 * w0, 2 * theta);
  const od = requiredOD(model.ratedPowerMw / 1000, lambda, w0);
  const info = CLASS_INFO[deviceClass];

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 shrink-0 flex flex-col items-center justify-center border-2 border-ltor-ink bg-yellow-300">
          <div className="text-[9px] font-semibold leading-none">KLASSE</div>
          <div className="text-xl font-bold leading-none font-mono">{deviceClass}</div>
        </div>
        <div className="min-w-0">
          <div className="font-semibold">Geräteklasse (Nennleistung {fmtPower(model.ratedPowerMw)})</div>
          <div className="text-ltor-mute leading-snug">{info.risk}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
        <div className="border border-ltor-line px-2 py-1">
          <div className="text-[10px] text-ltor-mute font-sans">MPE (Auge)</div>
          {fmt(mpe, 1)} W/m²
        </div>
        <div className="border border-ltor-line px-2 py-1">
          <div className="text-[10px] text-ltor-mute font-sans">Schutzbrille mind.</div>
          OD {fmt(od, 1)} @ {Math.round(lambda)} nm
        </div>
        <div className="border border-ltor-line px-2 py-1">
          <div className="text-[10px] text-ltor-mute font-sans">NOHD (Nennleistung)</div>
          {nohdRated >= 1000 ? `${fmt(nohdRated / 1000, 1)} km` : `${fmt(nohdRated, 1)} m`}
        </div>
        <div className="border border-ltor-line px-2 py-1">
          <div className="text-[10px] text-ltor-mute font-sans">NOHD (aktuell)</div>
          {nohdNow >= 1000 ? `${fmt(nohdNow / 1000, 1)} km` : `${fmt(nohdNow, 1)} m`}
          <span className="text-ltor-mute"> · ≙ Kl. {nowClass}</span>
        </div>
      </div>
      <ul className="list-disc pl-4 space-y-0.5 text-ltor-ink">
        {info.measures.map((m) => (
          <li key={m}>{m}</li>
        ))}
        {!isVisible(lambda) && <li>Unsichtbare Strahlung: kein Lidschlussreflex – Strahl nur mit IR-Karte/Viewer orten.</li>}
      </ul>
      <div className="flex gap-1.5 text-[10px] text-ltor-mute leading-snug border-t border-ltor-line pt-2">
        <Info size={12} className="shrink-0 mt-px" />
        <span>
          Lehrmodell mit vereinfachten Werten nach IEC 60825-1 / TROS Laserstrahlung (CW, Auge, 0,25 s
          sichtbar bzw. 10 s IR). Ersetzt keine Gefährdungsbeurteilung durch die/den
          Laserschutzbeauftragte:n. Die Laserklasse richtet sich nach der maximal zugänglichen
          Strahlung, nicht nach dem aktuellen Betriebspunkt.
        </span>
      </div>
    </div>
  );
}

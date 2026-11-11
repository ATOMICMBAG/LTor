import { useState } from "react";
import clsx from "clsx";
import { Plus, Trash2, AlertTriangle, Crosshair } from "lucide-react";
import {
  LENS_SHAPES,
  divergence,
  lensRadiiMm,
  radiusAt,
  type BeamSegment,
  type LaserModel,
  type LensShape,
} from "@shared/laserPhysics";
import { BENCH } from "./LabScene";
import { fmt } from "./panels";
import {
  MAX_LENSES,
  PRESETS,
  RAIL,
  clampLensZ,
  focalOptions,
  freeSpot,
  newLensId,
  signedFocal,
  sortLenses,
  type BenchLens,
} from "./optics";

/** 1/e² radius must stay below this fraction of the clear aperture (≈ 99 % transmission). */
const CLIP_FACTOR = 1.5;
const LENS_RADIUS_M = 0.0125;

function fmtLen(m: number): string {
  if (!Number.isFinite(m)) return "∞";
  const a = Math.abs(m);
  if (a >= 1) return `${fmt(m, 2)} m`;
  if (a >= 1e-3) return `${fmt(m * 1e3, 2)} mm`;
  return `${fmt(m * 1e6, 1)} µm`;
}

function fmtRadius(r: number): string {
  return Number.isFinite(r) ? `${r > 0 ? "+" : "−"}${fmt(Math.abs(r), 1)}` : "∞";
}

export function OpticsPanel(props: {
  model: LaserModel;
  lambdaNm: number;
  segments: BeamSegment[];
  lenses: BenchLens[];
  setLenses: (l: BenchLens[]) => void;
  planeZ: number;
  setPlaneZ: (z: number) => void;
  meterMw: number;
  shutterOpen: boolean;
  selectedLensId?: string;
  onSelectLens: (id: string) => void;
}) {
  const { model, segments } = props;
  const lenses = sortLenses(props.lenses);
  const [presetHint, setPresetHint] = useState<string | null>(null);
  const spot = freeSpot(lenses);

  function update(id: string, patch: Partial<BenchLens>) {
    props.setLenses(
      props.lenses.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.z !== undefined) next.z = clampLensZ(props.lenses, id, patch.z);
        return next;
      }),
    );
  }

  function changeShape(l: BenchLens, shape: LensShape) {
    const opts = focalOptions(shape);
    const want = signedFocal(shape, Math.abs(l.focalMm));
    const focalMm = opts.includes(want) ? want : opts.reduce((a, b) => (Math.abs(Math.abs(b) - Math.abs(want)) < Math.abs(Math.abs(a) - Math.abs(want)) ? b : a));
    update(l.id, { shape, focalMm });
  }

  function addLens() {
    if (spot === null || lenses.length >= MAX_LENSES) return;
    const l: BenchLens = { id: newLensId(), z: spot, focalMm: 100, shape: "planoconvex" };
    props.setLenses([...props.lenses, l]);
    props.onSelectLens(l.id);
  }

  // Real foci: waists that lie inside their own segment
  const foci = segments.slice(1).filter((s) => s.zWaist > s.zStart && s.zWaist < s.zEnd);
  const first = segments[0];
  const out = segments[segments.length - 1];
  const magnification = out.w0 / first.w0;
  const thetaOut = divergence(out.w0, props.lambdaNm * 1e-9, model.beam.m2);
  const lastFocus = foci[foci.length - 1];
  const peakFocus =
    lastFocus && props.shutterOpen ? (2 * (props.meterMw / 1000)) / (Math.PI * lastFocus.w0 ** 2) / 1e4 : 0;
  const focusOnAbsorber = lastFocus && Math.abs(BENCH.end - lastFocus.zWaist) < 2 * lastFocus.zR && peakFocus > 1e3;

  return (
    <div className="space-y-3 text-xs">
      {/* presets */}
      <div className="flex items-center gap-2">
        <select
          className="input text-xs py-1 flex-1"
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (!p) return;
            props.setLenses(p.build());
            setPresetHint(`${p.title}: ${p.hint}`);
          }}
        >
          <option value="">Vorlage laden …</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sm"
          onClick={addLens}
          disabled={spot === null || lenses.length >= MAX_LENSES}
          title={lenses.length >= MAX_LENSES ? `Maximal ${MAX_LENSES} Linsen` : "Linse in die größte freie Lücke setzen"}
        >
          <Plus size={12} /> Linse
        </button>
      </div>
      {presetHint && <div className="p-2 bg-neutral-50 border border-ltor-line leading-snug">{presetHint}</div>}

      {/* lens chain */}
      {lenses.length === 0 && (
        <div className="text-ltor-mute">Keine Linse auf der Schiene – der Strahl bleibt nahezu kollimiert.</div>
      )}
      {lenses.map((l, i) => {
        const w = radiusAt(segments, l.z);
        const clipped = w * CLIP_FACTOR > LENS_RADIUS_M;
        const [r1, r2] = lensRadiiMm(l.shape, l.focalMm);
        const selected = props.selectedLensId === l.id;
        return (
          <div
            key={l.id}
            className={clsx("border p-2 space-y-1.5", selected ? "border-ltor-ink" : "border-ltor-line")}
            onClick={() => props.onSelectLens(l.id)}
          >
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-semibold w-6">L{i + 1}</span>
              <select
                className="input text-[11px] py-0.5 flex-1 min-w-0"
                value={l.shape}
                onChange={(e) => changeShape(l, e.target.value as LensShape)}
              >
                <optgroup label="Sammellinsen (f > 0)">
                  {(Object.keys(LENS_SHAPES) as LensShape[])
                    .filter((s) => LENS_SHAPES[s].converging)
                    .map((s) => (
                      <option key={s} value={s}>
                        {LENS_SHAPES[s].name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Zerstreuungslinsen (f < 0)">
                  {(Object.keys(LENS_SHAPES) as LensShape[])
                    .filter((s) => !LENS_SHAPES[s].converging)
                    .map((s) => (
                      <option key={s} value={s}>
                        {LENS_SHAPES[s].name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <select
                className="input-mono text-[11px] py-0.5 w-[92px]"
                value={l.focalMm}
                onChange={(e) => update(l.id, { focalMm: Number(e.target.value) })}
              >
                {focalOptions(l.shape).map((f) => (
                  <option key={f} value={f}>
                    f {f > 0 ? "+" : "−"}{Math.abs(f)}
                  </option>
                ))}
              </select>
              <button
                className="btn-ghost text-ltor-alarm px-1"
                title="Linse entfernen"
                onClick={(e) => {
                  e.stopPropagation();
                  props.setLenses(props.lenses.filter((x) => x.id !== l.id));
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="flex-1 accent-neutral-900"
                min={RAIL.min * 1000}
                max={RAIL.max * 1000}
                step={1}
                value={Math.round(l.z * 1000)}
                onChange={(e) => update(l.id, { z: Number(e.target.value) / 1000 })}
              />
              <input
                type="number"
                className="input-mono text-[11px] py-0.5 w-16"
                min={RAIL.min * 1000}
                max={RAIL.max * 1000}
                value={Math.round(l.z * 1000)}
                onChange={(e) => update(l.id, { z: Number(e.target.value) / 1000 })}
              />
              <span className="text-[10px] text-ltor-mute">mm</span>
            </div>
            <div className="font-mono text-[10px] text-ltor-mute flex flex-wrap gap-x-3">
              <span>w = {fmtLen(w)}</span>
              <span>
                R₁ {fmtRadius(r1)} · R₂ {fmtRadius(r2)} mm
              </span>
            </div>
            {clipped && (
              <div className="flex items-center gap-1 text-[10px] text-ltor-warn">
                <AlertTriangle size={11} /> Strahl zu groß für die 1″-Linse (w·1,5 &gt; 12,5 mm) – Randstrahlen werden
                beschnitten.
              </div>
            )}
            {selected && <div className="text-[10px] text-ltor-mute leading-snug">{LENS_SHAPES[l.shape].note}</div>}
          </div>
        );
      })}

      {/* measurement plane */}
      <div className="border-t border-ltor-line pt-2 space-y-1.5">
        <label className="block">
          <span className="flex justify-between text-[10px] text-ltor-mute">
            <span>Messebene z</span>
            <span className="font-mono">{fmt(props.planeZ * 1000, 1)} mm</span>
          </span>
          <input
            type="range"
            className="w-full accent-blue-600"
            min={BENCH.planeMin * 1000}
            max={BENCH.planeMax * 1000}
            step={0.5}
            value={props.planeZ * 1000}
            onChange={(e) => props.setPlaneZ(Number(e.target.value) / 1000)}
          />
        </label>
        {foci.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {foci.map((f, k) => (
              <button
                key={k}
                className="btn btn-sm"
                onClick={() => props.setPlaneZ(Math.min(BENCH.planeMax, Math.max(BENCH.planeMin, f.zWaist)))}
              >
                <Crosshair size={11} /> {foci.length > 1 ? `Fokus ${k + 1}` : "Fokus"} ({Math.round(f.zWaist * 1000)} mm)
              </button>
            ))}
          </div>
        )}
      </div>

      {/* results */}
      <div className="border-t border-ltor-line pt-2 font-mono text-[11px] space-y-0.5">
        <div>
          <span className="text-ltor-mute font-sans">Eingang: </span>w₀ = {fmtLen(first.w0)} · θ ={" "}
          {fmt(divergence(first.w0, props.lambdaNm * 1e-9, model.beam.m2) * 1e3, 3)} mrad · z_R = {fmtLen(first.zR)}
        </div>
        {lenses.length > 0 && (
          <>
            <div>
              <span className="text-ltor-mute font-sans">Ausgang: </span>w₀ = {fmtLen(out.w0)}
              {out.zR > 2 ? " (kollimiert)" : ` bei z = ${fmtLen(out.zWaist)}`} · z_R = {fmtLen(out.zR)} · θ ={" "}
              {fmt(thetaOut * 1e3, 3)} mrad
            </div>
            <div>
              <span className="text-ltor-mute font-sans">Taillen-Verhältnis w₀,aus/w₀,ein: </span>
              {fmt(magnification, 3)}
              <span className="text-ltor-mute font-sans">
                {out.zR > 2 ? " – kollimierter Ausgang (Teleskop)" : ""}
              </span>
            </div>
            {lastFocus && (
              <div>
                <span className="text-ltor-mute font-sans">Spitzenintensität im letzten Fokus: </span>
                {peakFocus > 0 ? `${peakFocus.toExponential(2)} W/cm²` : "— (Shutter zu)"}
              </div>
            )}
          </>
        )}
        {focusOnAbsorber && (
          <div className="text-ltor-alarm font-sans">
            Fokus liegt auf dem Absorber – thermische Messköpfe vertragen typ. nur wenige kW/cm².
          </div>
        )}
      </div>
    </div>
  );
}

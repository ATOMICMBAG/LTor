import { useEffect, useMemo, useRef, useState } from "react";
import { Power, PowerOff, Zap, AlertTriangle, MousePointer2 } from "lucide-react";
import {
  LASER_MODELS,
  LASER_MODEL_IDS,
  benchBeam,
  divergence,
  isVisible,
  radiusAt,
  wavelengthToRgb,
  type LaserModelId,
} from "@shared/laserPhysics";
import type { Connection, SimConfig, SimWriteChannel } from "@shared/types";
import { useConnectionsStore } from "../../store/connectionsStore";
import { ipc } from "../../ipc";
import { LabScene, BENCH, BEAM_EXAGGERATION } from "./LabScene";
import { PiChart, CausticChart, BeamProfile } from "./charts";
import { ControlPanel, Readouts, SafetyPanel, Panel, StateBadge, fmt } from "./panels";
import { TrainingPanel, useExerciseTracker, type TrainingTab } from "./TrainingPanel";
import { useSimFrame, num, bool, str } from "./useSimFrame";
import type { LabPart } from "./knowledge";

const FOCAL_LENGTHS_MM = [25, 50, 75, 100, 150, 200];
/** False colour for invisible (IR) beams. */
const IR_FALSE_COLOR = "#d946ef";

function modelOf(c: Connection | undefined): LaserModelId {
  const m = (c?.config as SimConfig | undefined)?.model;
  return m && m in LASER_MODELS ? m : "dpss532";
}

function beamColorFor(lambdaNm: number): string {
  const rgb = wavelengthToRgb(lambdaNm);
  if (!rgb) return IR_FALSE_COLOR;
  const [r, g, b] = rgb.map((x) => Math.round(x * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

export function LaserLabModule() {
  const connections = useConnectionsStore((s) => s.connections);
  const upsert = useConnectionsStore((s) => s.upsert);
  const sims = connections.filter((c) => c.kind === "sim");

  const [selectedId, setSelectedId] = useState<string | undefined>();
  const conn = sims.find((c) => c.id === selectedId) ?? sims[0];
  const model = LASER_MODELS[modelOf(conn)];
  const connected = conn?.status === "connected";
  const busy = conn?.status === "connecting";

  const frame = useSimFrame(connected ? conn?.id : undefined);
  const v = frame.values;

  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState<LabPart | null>(null);
  const [tab, setTab] = useState<TrainingTab>("now");

  // ---- optics on the bench (local to this view) --------------------------
  const [lensInPath, setLensInPath] = useState(true);
  const [focalMm, setFocalMm] = useState(100);
  const [lensZ, setLensZ] = useState(0.25);
  const [planeZ, setPlaneZ] = useState(0.5);

  const lambdaNm = Math.round(num(v, "wavelength_nm", model.wavelengthNm) * 10) / 10;
  const segments = useMemo(
    () =>
      benchBeam({
        w0: model.beam.w0Mm * 1e-3,
        lambda: lambdaNm * 1e-9,
        m2: model.beam.m2,
        lens: lensInPath ? { z: lensZ, focal: focalMm * 1e-3 } : undefined,
        zEnd: BENCH.end,
      }),
    [model, lambdaNm, lensInPath, lensZ, focalMm],
  );
  const focus = lensInPath ? segments[1] : undefined;

  const shutterOpen = bool(v, "shutter");
  const laserMw = num(v, "laser_power_mW");
  const meterMw = num(v, "power_mW");
  const state = str(v, "state", connected ? "OFF" : "");
  const led = !connected ? "off" : state === "ARMING" ? "blink" : bool(v, "emission") ? "on" : "off";

  const tracker = useExerciseTracker({
    connectionId: conn?.id,
    model,
    v,
    optics: { lensInPath, focusZ: focus?.zWaist, focusZR: focus?.zR, planeZ },
  });

  // Log optics changes (debounced) so the protocol shows what was done.
  const firstOptics = useRef(true);
  useEffect(() => {
    if (firstOptics.current) {
      firstOptics.current = false;
      return;
    }
    if (!conn) return;
    const t = setTimeout(() => {
      const summary = lensInPath ?
          `Linse f = ${focalMm} mm bei z = ${Math.round(lensZ * 1000)} mm, Messebene bei z = ${Math.round(planeZ * 1000)} mm`
        : `ohne Linse, Messebene bei z = ${Math.round(planeZ * 1000)} mm`;
      void ipc.audit
        .append({
          category: "user",
          actor: "user",
          action: "lab_optics_changed",
          details: { connectionId: conn.id, summary, lensInPath, focalMm, lensZmm: Math.round(lensZ * 1000), planeZmm: Math.round(planeZ * 1000) },
        })
        .catch(() => undefined);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lensInPath, focalMm, Math.round(lensZ * 1000), Math.round(planeZ * 1000)]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(t);
  }, [error]);

  async function write(channel: SimWriteChannel, value: number | boolean) {
    if (!conn) return;
    try {
      const r = await ipc.connections.write({ connectionId: conn.id, channel, value });
      if (!r.ok) setError(r.error ?? "Befehl abgelehnt");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function connect(c: Connection) {
    try {
      const r = await ipc.connections.connect(c.id);
      if (!r.ok) setError(r.error ?? "Verbindung fehlgeschlagen");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function chooseModel(id: LaserModelId) {
    // keep only one simulated laser running (the demo limits active devices)
    if (conn && connected && modelOf(conn) !== id) {
      await ipc.connections.disconnect(conn.id).catch(() => undefined);
    }
    const existing = sims.find((c) => modelOf(c) === id);
    if (existing) {
      setSelectedId(existing.id);
      if (existing.status !== "connected") void connect(existing);
      return;
    }
    try {
      const created = await ipc.connections.create({
        name: `Laserlabor · ${LASER_MODELS[id].name}`,
        kind: "sim",
        config: { model: id, sampleRateHz: 5, noise: 0.3 },
      });
      upsert(created);
      setSelectedId(created.id);
      void connect(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const wLens = radiusAt(segments, lensZ);
  const wPlane = radiusAt(segments, planeZ);
  const lambdaEffM = lambdaNm * 1e-9 * model.beam.m2;
  const powerAtPlaneW =
    planeZ < BENCH.shutterZ || shutterOpen ? (planeZ < BENCH.shutterZ ? laserMw : meterMw) / 1000 : 0;
  const peakFocus = focus && shutterOpen ? (2 * (meterMw / 1000)) / (Math.PI * focus.w0 * focus.w0) / 1e4 : 0;
  const focusOnAbsorber = focus && Math.abs(BENCH.end - focus.zWaist) < 2 * focus.zR && peakFocus > 1e3;

  // ---- render --------------------------------------------------------------
  return (
    <div className="p-4 max-w-[1700px] mx-auto space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Zap size={20} /> Laserlabor
          </h1>
          <p className="text-sm text-ltor-mute mt-1">
            Virtueller Laserplatz mit physikalischem Modell – bedienen, messen, verstehen. Für Auszubildende und
            angehende Laserfachkräfte.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label>
            <span className="label">Lasertyp</span>
            <select className="input text-sm min-w-[230px]" value={model.id} onChange={(e) => void chooseModel(e.target.value as LaserModelId)}>
              {LASER_MODEL_IDS.map((id) => (
                <option key={id} value={id}>
                  {LASER_MODELS[id].name}
                </option>
              ))}
            </select>
          </label>
          {conn &&
            (connected ?
              <button className="btn" onClick={() => void ipc.connections.disconnect(conn.id)}>
                <PowerOff size={14} /> Trennen
              </button>
            : <button className="btn" onClick={() => void connect(conn)} disabled={busy}>
                <Power size={14} /> {busy ? "Verbindet …" : "Verbinden"}
              </button>)}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 text-sm border border-ltor-alarm bg-red-50 text-ltor-alarm">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ---------------- left: 3D + measurements ---------------- */}
        <div className="space-y-3 min-w-0">
          <div className="panel relative h-[460px] overflow-hidden">
            <LabScene
              segments={segments}
              beamColor={beamColorFor(lambdaNm)}
              powerMw={connected ? laserMw : 0}
              shutterOpen={shutterOpen}
              led={led}
              lensInPath={lensInPath}
              lensZ={lensZ}
              planeZ={planeZ}
              onSelect={(p) => {
                setPart(p);
                setTab("part");
              }}
              onLensMove={setLensZ}
              onPlaneMove={setPlaneZ}
              onDragEnd={() => undefined}
            />
            <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
              {state && <StateBadge state={state} />}
              <span className="badge font-mono">{model.medium}</span>
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap justify-between gap-2 text-[10px] text-ltor-mute pointer-events-none">
              <span className="bg-white/85 px-1.5 py-0.5">
                Strahlradius {BEAM_EXAGGERATION}× überhöht
                {!isVisible(lambdaNm) && ` · ${Math.round(lambdaNm)} nm ist unsichtbar – hier in Falschfarbe`}
              </span>
              <span className="bg-white/85 px-1.5 py-0.5 flex items-center gap-1">
                <MousePointer2 size={10} /> Ziehen = drehen · Rad = Zoom · Linse & Messebene verschieben · Bauteil anklicken
              </span>
            </div>
            {!connected && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                {conn ?
                  <button className="btn bg-white" onClick={() => void connect(conn)} disabled={busy}>
                    <Power size={14} /> {busy ? "Verbindet …" : `${model.name} einschalten (verbinden)`}
                  </button>
                : <button className="btn bg-white" onClick={() => void chooseModel("dpss532")}>
                    <Zap size={14} /> Simulator-Laser anlegen
                  </button>
                }
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-3">
            <div className="panel p-2 h-[240px]">
              <PiChart
                model={model}
                tecC={num(v, "tec_set_C", 25)}
                currentmA={num(v, "current_mA")}
                powerMw={laserMw}
                thresholdmA={num(v, "threshold_mA", model.ithRefmA)}
                trail={frame.trail}
              />
            </div>
            <div className="panel p-2 h-[240px]">
              <CausticChart segments={segments} zEnd={BENCH.end} lensZ={lensInPath ? lensZ : undefined} planeZ={planeZ} />
            </div>
            <div className="panel p-2 h-[240px]">
              <BeamProfile w={wPlane} powerW={connected ? powerAtPlaneW : 0} m2={model.beam.m2} />
            </div>
          </div>

          <Panel title="Optik auf der Bank">
            <div className="grid md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={lensInPath} onChange={(e) => setLensInPath(e.target.checked)} />
                    Linse im Strahlengang
                  </label>
                  <select
                    className="input text-xs py-1 w-auto"
                    value={focalMm}
                    disabled={!lensInPath}
                    onChange={(e) => setFocalMm(Number(e.target.value))}
                  >
                    {FOCAL_LENGTHS_MM.map((f) => (
                      <option key={f} value={f}>
                        f = {f} mm
                      </option>
                    ))}
                  </select>
                </div>
                <label className="block">
                  <span className="flex justify-between text-[10px] text-ltor-mute">
                    <span>Linsenposition z</span>
                    <span className="font-mono">{Math.round(lensZ * 1000)} mm</span>
                  </span>
                  <input
                    type="range"
                    className="w-full accent-neutral-900"
                    min={BENCH.lensMin * 1000}
                    max={BENCH.lensMax * 1000}
                    step={1}
                    value={Math.round(lensZ * 1000)}
                    disabled={!lensInPath}
                    onChange={(e) => setLensZ(Number(e.target.value) / 1000)}
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-[10px] text-ltor-mute">
                    <span>Messebene z</span>
                    <span className="font-mono">{fmt(planeZ * 1000, 1)} mm</span>
                  </span>
                  <input
                    type="range"
                    className="w-full accent-blue-600"
                    min={BENCH.planeMin * 1000}
                    max={BENCH.planeMax * 1000}
                    step={0.5}
                    value={planeZ * 1000}
                    onChange={(e) => setPlaneZ(Number(e.target.value) / 1000)}
                  />
                </label>
                {focus && (
                  <button className="btn btn-sm" onClick={() => setPlaneZ(Math.min(BENCH.planeMax, Math.max(BENCH.planeMin, focus.zWaist)))}>
                    Messebene in den Fokus
                  </button>
                )}
              </div>
              <div className="font-mono text-[11px] space-y-1">
                <div>
                  <span className="text-ltor-mute font-sans">Austritt: </span>w₀ = {fmt(model.beam.w0Mm, 2)} mm · M² = {fmt(model.beam.m2, 2)} · θ ={" "}
                  {fmt(divergence(model.beam.w0Mm * 1e-3, lambdaNm * 1e-9, model.beam.m2) * 1e3, 3)} mrad · z_R ={" "}
                  {fmt(segments[0].zR, 1)} m
                </div>
                {focus ?
                  <>
                    <div>
                      <span className="text-ltor-mute font-sans">An der Linse: </span>w_L = {fmt(wLens * 1e3, 3)} mm
                    </div>
                    <div>
                      <span className="text-ltor-mute font-sans">Fokus: </span>w₀′ = {fmt(focus.w0 * 1e6, 1)} µm bei z ={" "}
                      {fmt(focus.zWaist * 1000, 1)} mm · z_R′ = {fmt(focus.zR * 1000, 2)} mm
                    </div>
                    <div className="text-ltor-mute">
                      Näherung M²·λ·f/(π·w_L) = {fmt(((lambdaEffM * focalMm * 1e-3) / (Math.PI * wLens)) * 1e6, 1)} µm
                    </div>
                    <div>
                      <span className="text-ltor-mute font-sans">Spitzenintensität im Fokus: </span>
                      {peakFocus > 0 ? `${peakFocus.toExponential(2)} W/cm²` : "— (Shutter zu / kein Strahl)"}
                    </div>
                    {focus.zWaist > BENCH.end && (
                      <div className="text-ltor-warn font-sans">Der Fokus liegt hinter dem Leistungsmesser.</div>
                    )}
                    {focusOnAbsorber && (
                      <div className="text-ltor-alarm font-sans">
                        Achtung: Fokus liegt auf dem Absorber. Thermische Messköpfe vertragen typ. nur wenige kW/cm² – Messkopf
                        defokussiert betreiben!
                      </div>
                    )}
                  </>
                : <div className="text-ltor-mute font-sans">Ohne Linse bleibt der Strahl nahezu kollimiert (z_R ≫ Banklänge).</div>}
              </div>
            </div>
          </Panel>
        </div>

        {/* ---------------- right: control, safety, learning ---------------- */}
        <div className="space-y-3 min-w-0">
          <Panel title="Steuerung" right={<span className="font-mono normal-case tracking-normal">{model.name}</span>}>
            <div className="space-y-3">
              <ControlPanel model={model} v={v} write={write} connected={connected} />
              <Readouts model={model} v={v} />
            </div>
          </Panel>
          <Panel title="Laserschutz">
            <SafetyPanel model={model} powerMw={meterMw} lambdaNm={lambdaNm} />
          </Panel>
          <section className="panel h-[460px] flex flex-col">
            <TrainingPanel
              tab={tab}
              onTab={setTab}
              connectionId={conn?.id}
              model={model}
              v={v}
              done={tracker.done}
              onQuizCorrect={() => tracker.complete("classify")}
              part={part}
            />
          </section>
        </div>
      </div>

      <Panel title={`Über diesen Laser · ${model.name}`}>
        <div className="grid md:grid-cols-[2fr_1fr] gap-4 text-xs leading-relaxed">
          <p>{model.description}</p>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ltor-mute">Anwendungen</div>
            <ul className="list-disc pl-4">
              {model.applications.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <div className="text-[10px] text-ltor-mute mt-2">
              Modellparameter sind typische Lehrbuchwerte, keine Daten eines bestimmten Produkts.
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Power, PowerOff, Zap, AlertTriangle, MousePointer2, SlidersHorizontal, Focus } from "lucide-react";
import {
  LASER_MODELS,
  LASER_MODEL_IDS,
  LENS_SHAPES,
  benchBeam,
  isVisible,
  lensRadiiMm,
  radiusAt,
  wavelengthToRgb,
  type LaserModelId,
} from "@shared/laserPhysics";
import type { Connection, SimConfig, SimWriteChannel } from "@shared/types";
import { useConnectionsStore } from "../../store/connectionsStore";
import { ipc } from "../../ipc";
import { LabScene, BENCH, BEAM_EXAGGERATION } from "./LabScene";
import { PiChart, CausticChart, BeamProfile } from "./charts";
import { ControlPanel, Readouts, SafetyPanel, StateBadge, fmt } from "./panels";
import { OpticsPanel } from "./OpticsPanel";
import { TrainingPanel, useExerciseTracker, type OpticsState, type TrainingTab } from "./TrainingPanel";
import { useSimFrame, num, bool, str } from "./useSimFrame";
import { PRESETS, clampLensZ, describeLens, lensLabel, opticsSummary, sortLenses, type BenchLens } from "./optics";
import type { LabPart } from "./knowledge";

/** False colour for invisible (IR) beams. */
const IR_FALSE_COLOR = "#d946ef";

type ControlTab = "laser" | "optics";

function modelOf(c: Connection | undefined): LaserModelId {
  const m = (c?.config as SimConfig | undefined)?.model;
  return m && m in LASER_MODELS ? m : "dpss532";
}

const fmtRadius = (r: number) => (Number.isFinite(r) ? fmt(r, 1) : "∞");

function beamColorFor(lambdaNm: number): string {
  const rgb = wavelengthToRgb(lambdaNm);
  if (!rgb) return IR_FALSE_COLOR;
  const [r, g, b] = rgb.map((x) => Math.round(x * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Laserlabor. On large screens (xl) everything fits on one page: 3D bench
 * and charts on the left, "Steuerung" (laser + optics) and the help area
 * (incl. laser safety) on the right – no scrolling while adjusting optics.
 */
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
  const [controlTab, setControlTab] = useState<ControlTab>("laser");

  // ---- optics on the bench (local to this view) --------------------------
  const [lenses, setLenses] = useState<BenchLens[]>(() => PRESETS[0].build());
  const [selectedLens, setSelectedLens] = useState<string | undefined>();
  const [planeZ, setPlaneZ] = useState(0.5);
  const sorted = useMemo(() => sortLenses(lenses), [lenses]);

  const lambdaNm = Math.round(num(v, "wavelength_nm", model.wavelengthNm) * 10) / 10;
  const segments = useMemo(
    () =>
      benchBeam({
        w0: model.beam.w0Mm * 1e-3,
        lambda: lambdaNm * 1e-9,
        m2: model.beam.m2,
        lenses: lenses.map((l) => ({ z: l.z, focal: l.focalMm * 1e-3 })),
        zEnd: BENCH.end,
      }),
    [model, lambdaNm, lenses],
  );

  const shutterOpen = bool(v, "shutter");
  const laserMw = num(v, "laser_power_mW");
  const meterMw = num(v, "power_mW");
  const state = str(v, "state", connected ? "OFF" : "");
  const led = !connected ? "off" : state === "ARMING" ? "blink" : bool(v, "emission") ? "on" : "off";

  const optics: OpticsState = useMemo(() => {
    const out = segments[segments.length - 1];
    return {
      lensCount: lenses.length,
      foci: segments
        .slice(1)
        .filter((s) => s.zWaist > s.zStart && s.zWaist < s.zEnd)
        .map((s) => ({ z: s.zWaist, zR: s.zR })),
      planeZ,
      magnification: out.w0 / segments[0].w0,
      outZR: out.zR,
    };
  }, [segments, lenses.length, planeZ]);

  const tracker = useExerciseTracker({ connectionId: conn?.id, model, v, optics });

  // Log optics changes (debounced) so the protocol shows what was done.
  const summary = opticsSummary(lenses, planeZ);
  const firstOptics = useRef(true);
  useEffect(() => {
    if (firstOptics.current) {
      firstOptics.current = false;
      return;
    }
    if (!conn) return;
    const t = setTimeout(() => {
      void ipc.audit
        .append({
          category: "user",
          actor: "user",
          action: "lab_optics_changed",
          details: {
            connectionId: conn.id,
            summary,
            lenses: sortLenses(lenses).map((l) => ({ zMm: Math.round(l.z * 1000), focalMm: l.focalMm, shape: l.shape })),
            planeZmm: Math.round(planeZ * 1000),
          },
        })
        .catch(() => undefined);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

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

  const wPlane = radiusAt(segments, planeZ);
  const powerAtPlaneW =
    planeZ < BENCH.shutterZ ? laserMw / 1000
    : shutterOpen ? meterMw / 1000
    : 0;

  const clickedLens = part === "Lens" ? lenses.find((l) => l.id === selectedLens) : undefined;

  // ---- render --------------------------------------------------------------
  return (
    <div className="relative p-3 max-w-[1900px] mx-auto flex flex-col gap-3 xl:h-full xl:min-h-0">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Zap size={18} /> Laserlabor
            <span className="hidden lg:inline text-xs font-normal text-ltor-mute">
              Virtueller Laserplatz mit physikalischem Modell – bedienen, messen, verstehen.
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input text-sm min-w-[220px] py-1"
            value={model.id}
            title="Lasertyp"
            onChange={(e) => void chooseModel(e.target.value as LaserModelId)}
          >
            {LASER_MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {LASER_MODELS[id].name}
              </option>
            ))}
          </select>
          {conn &&
            (connected ?
              <button className="btn btn-sm" onClick={() => void ipc.connections.disconnect(conn.id)}>
                <PowerOff size={13} /> Trennen
              </button>
            : <button className="btn btn-sm" onClick={() => void connect(conn)} disabled={busy}>
                <Power size={13} /> {busy ? "Verbindet …" : "Verbinden"}
              </button>)}
        </div>
      </div>

      {error && (
        <div className="absolute z-20 top-14 right-3 max-w-md flex items-center gap-2 p-2 text-sm border border-ltor-alarm bg-red-50 text-ltor-alarm shadow">
          <AlertTriangle size={14} className="shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-3 xl:flex-1 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_430px]">
        {/* ---------------- left: 3D + measurements ---------------- */}
        <div className="flex flex-col gap-3 min-w-0 xl:min-h-0">
          <div className="panel relative overflow-hidden h-[420px] xl:h-auto xl:flex-1 xl:min-h-[240px]">
            <LabScene
              segments={segments}
              beamColor={beamColorFor(lambdaNm)}
              powerMw={connected ? laserMw : 0}
              shutterOpen={shutterOpen}
              led={led}
              lenses={lenses}
              planeZ={planeZ}
              onSelect={(p, lensId) => {
                setPart(p);
                setTab("part");
                if (lensId) {
                  setSelectedLens(lensId);
                  setControlTab("optics");
                }
              }}
              onLensMove={(id, z) =>
                setLenses((ls) => ls.map((l) => (l.id === id ? { ...l, z: clampLensZ(ls, id, z) } : l)))
              }
              onPlaneMove={setPlaneZ}
              onDragEnd={() => undefined}
            />
            <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
              {state && <StateBadge state={state} />}
              <span className="badge font-mono">{model.medium}</span>
              {sorted.length > 0 && (
                <span className="badge font-mono">
                  {sorted.length} {sorted.length === 1 ? "Linse" : "Linsen"}
                </span>
              )}
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap justify-between gap-2 text-[10px] text-ltor-mute pointer-events-none">
              <span className="bg-white/85 px-1.5 py-0.5">
                Strahlradius {BEAM_EXAGGERATION}× überhöht
                {!isVisible(lambdaNm) && ` · ${Math.round(lambdaNm)} nm ist unsichtbar – hier in Falschfarbe`}
              </span>
              <span className="bg-white/85 px-1.5 py-0.5 flex items-center gap-1">
                <MousePointer2 size={10} /> Ziehen = drehen · Rad = Zoom · Linsen & Messebene verschieben · Bauteil
                anklicken
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

          <div className="grid md:grid-cols-3 gap-3 shrink-0">
            <div className="panel p-2 h-[210px]">
              <PiChart
                model={model}
                tecC={num(v, "tec_set_C", 25)}
                currentmA={num(v, "current_mA")}
                powerMw={laserMw}
                thresholdmA={num(v, "threshold_mA", model.ithRefmA)}
                trail={frame.trail}
              />
            </div>
            <div className="panel p-2 h-[210px]">
              <CausticChart segments={segments} zEnd={BENCH.end} lensZs={sorted.map((l) => l.z)} planeZ={planeZ} />
            </div>
            <div className="panel p-2 h-[210px]">
              <BeamProfile w={wPlane} powerW={connected ? powerAtPlaneW : 0} m2={model.beam.m2} />
            </div>
          </div>
        </div>

        {/* ---------------- right: Steuerung + Hilfe ---------------- */}
        <div className="flex flex-col gap-3 min-w-0 xl:min-h-0">
          <section className="panel flex flex-col min-h-0 h-[560px] xl:h-auto xl:flex-[1.25_1_0%]">
            <div className="flex items-center border-b border-ltor-line">
              {(
                [
                  { id: "laser", label: "Steuerung", icon: <SlidersHorizontal size={12} /> },
                  {
                    id: "optics",
                    label: `Optik · ${sorted.length} ${sorted.length === 1 ? "Linse" : "Linsen"}`,
                    icon: <Focus size={12} />,
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setControlTab(t.id)}
                  className={clsx(
                    "flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[11px] uppercase tracking-wider border-b-2 -mb-px",
                    controlTab === t.id ?
                      "border-ltor-ink font-semibold text-ltor-ink"
                    : "border-transparent text-ltor-mute hover:text-ltor-ink",
                  )}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3">
              {controlTab === "laser" ?
                <div className="space-y-3">
                  <ControlPanel model={model} v={v} write={write} connected={connected} />
                  <Readouts model={model} v={v} />
                </div>
              : <OpticsPanel
                  model={model}
                  lambdaNm={lambdaNm}
                  segments={segments}
                  lenses={lenses}
                  setLenses={setLenses}
                  planeZ={planeZ}
                  setPlaneZ={setPlaneZ}
                  meterMw={meterMw}
                  shutterOpen={shutterOpen}
                  selectedLensId={selectedLens}
                  onSelectLens={setSelectedLens}
                />
              }
            </div>
          </section>

          <section className="panel flex flex-col min-h-0 h-[460px] xl:h-auto xl:flex-1">
            <TrainingPanel
              tab={tab}
              onTab={setTab}
              connectionId={conn?.id}
              model={model}
              v={v}
              done={tracker.done}
              onQuizCorrect={() => tracker.complete("classify")}
              part={part}
              partExtra={
                clickedLens && (
                  <div className="p-2 border border-ltor-line bg-neutral-50 font-mono text-[11px]">
                    {lensLabel(lenses, clickedLens.id)}: {describeLens(clickedLens)} · z ={" "}
                    {Math.round(clickedLens.z * 1000)} mm
                    <br />
                    R₁ = {fmtRadius(lensRadiiMm(clickedLens.shape, clickedLens.focalMm)[0])} mm · R₂ ={" "}
                    {fmtRadius(lensRadiiMm(clickedLens.shape, clickedLens.focalMm)[1])} mm (N-BK7)
                    <div className="font-sans text-ltor-mute mt-1">{LENS_SHAPES[clickedLens.shape].note}</div>
                  </div>
                )
              }
              laserInfo={
                <div className="space-y-2">
                  <div className="text-sm font-semibold">{model.name}</div>
                  <p>{model.description}</p>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-ltor-mute">Anwendungen</div>
                    <ul className="list-disc pl-4">
                      {model.applications.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-[10px] text-ltor-mute">
                    Modellparameter sind typische Lehrbuchwerte, keine Daten eines bestimmten Produkts.
                  </div>
                </div>
              }
              safety={<SafetyPanel model={model} powerMw={meterMw} lambdaNm={lambdaNm} />}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

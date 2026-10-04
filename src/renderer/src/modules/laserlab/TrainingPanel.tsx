import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Circle, GraduationCap, ScrollText, Lightbulb, Box } from "lucide-react";
import {
  effectiveThresholdmA,
  laserClass,
  requiredOD,
  type LaserClass,
  type LaserModel,
} from "@shared/laserPhysics";
import type { AuditEntry } from "@shared/types";
import { useAuditStore } from "../../store/auditStore";
import { ipc } from "../../ipc";
import { EXERCISES, PARTS, describeAction, explainState, type LabPart } from "./knowledge";
import { bool, num, str, type SimValues } from "./useSimFrame";

export type TrainingTab = "now" | "exercises" | "log" | "part";

export interface OpticsState {
  lensInPath: boolean;
  /** Focus position and Rayleigh range after the lens [m] (undefined w/o lens). */
  focusZ?: number;
  focusZR?: number;
  planeZ: number;
}

function storageKey(modelId: string) {
  return `ltor.lab.done.${modelId}`;
}

function loadDone(modelId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(modelId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveDone(modelId: string, done: Set<string>) {
  try {
    localStorage.setItem(storageKey(modelId), JSON.stringify([...done]));
  } catch {
    // private mode etc. – progress then only lives for this page view
  }
}

/**
 * Watches the live values and marks exercises as completed. Completed
 * exercises are remembered per laser model in this browser and written to
 * the audit log, so trainees (and trainers) can see what was achieved.
 */
export function useExerciseTracker(opts: {
  connectionId?: string;
  model: LaserModel;
  v: SimValues;
  optics: OpticsState;
}) {
  const { connectionId, model, v, optics } = opts;
  const [done, setDone] = useState<Set<string>>(() => loadDone(model.id));
  const prev = useRef<SimValues>({});
  const tecRange = useRef<{ min: number; max: number } | null>(null);
  /** Since when the pump absorption has been held ≥ 90 % in steady state. */
  const tunedSince = useRef<number | null>(null);

  useEffect(() => {
    setDone(loadDone(model.id));
    tecRange.current = null;
  }, [model.id]);

  function complete(id: string) {
    setDone((d) => {
      if (d.has(id)) return d;
      const next = new Set(d);
      next.add(id);
      saveDone(model.id, next);
      const ex = EXERCISES.find((e) => e.id === id);
      void ipc.audit
        .append({
          category: "user",
          actor: "user",
          action: "lab_exercise_completed",
          details: { connectionId, exercise: id, title: ex?.title, model: model.id },
        })
        .catch(() => undefined);
      return next;
    });
  }

  useEffect(() => {
    if (Object.keys(v).length === 0) return;
    const p = prev.current;
    const state = str(v, "state");
    const current = num(v, "current_mA");
    const emission = bool(v, "emission");
    const shutter = bool(v, "shutter");
    const tecSet = num(v, "tec_set_C", 25);

    // 1) safe start: emission switched on with interlock closed, shutter closed, I_set = 0
    if (p["emission"] === false && emission && bool(v, "interlock", true) && !shutter && num(v, "current_set_mA") === 0) {
      complete("safe_start");
    }
    // 2) threshold found
    if (state === "LASING" && current <= 1.15 * effectiveThresholdmA(model, tecSet)) {
      complete("threshold");
    }
    // 3) temperature influence (diodes): settled points ≥ 8 K apart while lasing
    if (model.kind === "diode" && state === "LASING" && Math.abs(num(v, "case_C") - tecSet) < 0.5) {
      const r = tecRange.current ?? { min: tecSet, max: tecSet };
      r.min = Math.min(r.min, tecSet);
      r.max = Math.max(r.max, tecSet);
      tecRange.current = r;
      if (r.max - r.min >= 8) complete("temperature");
    }
    // 4) pump tuning (DPSS): absorption ≥ 90 % held for 3 s in steady state –
    //    passing through the line while the current ramps does not count.
    const steady =
      Math.abs(current - num(v, "current_set_mA")) < 0.01 * model.maxCurrentmA &&
      Math.abs(num(v, "case_C") - tecSet) < 0.5;
    if (model.kind === "dpss" && steady && current >= 1000 && num(v, "absorption_pct") >= 90) {
      tunedSince.current ??= Date.now();
      if (Date.now() - tunedSince.current >= 3000) complete("pump_tuning");
    } else {
      tunedSince.current = null;
    }
    // 5) focus measured
    if (
      optics.lensInPath &&
      optics.focusZ !== undefined &&
      optics.focusZR !== undefined &&
      shutter &&
      num(v, "power_mW") > 0 &&
      Math.abs(optics.planeZ - optics.focusZ) <= optics.focusZR
    ) {
      complete("focus");
    }
    // 7) safe stop: emission switched off with shutter closed and current ramped down
    if (p["emission"] === true && !emission && !shutter && num(p, "current_mA") < 0.01 * model.maxCurrentmA) {
      complete("safe_stop");
    }
    prev.current = { ...v };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, optics.lensInPath, optics.planeZ, optics.focusZ, optics.focusZR]);

  return { done, complete };
}

// ---------------------------------------------------------------------------

function Quiz(props: { model: LaserModel; connectionId?: string; onCorrect: () => void }) {
  const { model } = props;
  const lambda = model.wavelengthNm;
  const correctClass = laserClass(model.ratedPowerMw / 1000, lambda);
  const minOD = Math.ceil(requiredOD(model.ratedPowerMw / 1000, lambda, model.beam.w0Mm * 1e-3));
  const [cls, setCls] = useState<LaserClass | "">("");
  const [od, setOd] = useState("");
  const [result, setResult] = useState<string | null>(null);

  function check() {
    const okClass = cls === correctClass;
    const odNum = Number(od);
    const okOd = od !== "" && odNum >= minOD;
    const summary =
      `Klasse ${cls || "?"} (${okClass ? "richtig" : `richtig wäre ${correctClass}`}), ` +
      `OD ${od || "?"} (${okOd ? "ausreichend" : `mind. OD ${minOD}`})`;
    void ipc.audit
      .append({
        category: "user",
        actor: "user",
        action: "lab_quiz_answer",
        details: { connectionId: props.connectionId, model: model.id, summary, correct: okClass && okOd },
      })
      .catch(() => undefined);
    if (okClass && okOd) {
      setResult(`Richtig! Klasse ${correctClass}, Schutzbrille mindestens OD ${minOD} bei ${Math.round(lambda)} nm.`);
      props.onCorrect();
    } else {
      setResult(
        (okClass ? "Klasse stimmt. " : "Klasse stimmt noch nicht – maßgeblich ist die Nennleistung. ") +
          (okOd ? "OD ausreichend." : "OD zu niedrig: OD = log₁₀(E/MPE), E über 7 mm Pupille gemittelt."),
      );
    }
  }

  return (
    <div className="mt-2 p-2 bg-neutral-50 border border-ltor-line space-y-2">
      <div className="text-[11px]">
        {model.name}: Nennleistung {model.ratedPowerMw} mW, λ = {lambda} nm, w₀ = {model.beam.w0Mm} mm.
      </div>
      <div className="flex gap-2 items-end">
        <label className="flex-1">
          <span className="text-[10px] text-ltor-mute">Laserklasse</span>
          <select className="input text-xs py-1" value={cls} onChange={(e) => setCls(e.target.value as LaserClass)}>
            <option value="">—</option>
            {(["1", "2", "3R", "3B", "4"] as LaserClass[]).map((c) => (
              <option key={c} value={c}>
                Klasse {c}
              </option>
            ))}
          </select>
        </label>
        <label className="w-24">
          <span className="text-[10px] text-ltor-mute">OD (Schutzstufe)</span>
          <input className="input-mono text-xs py-1" type="number" min={0} max={10} value={od} onChange={(e) => setOd(e.target.value)} />
        </label>
        <button className="btn btn-sm" onClick={check} disabled={!cls || od === ""}>
          Prüfen
        </button>
      </div>
      {result && <div className="text-[11px]">{result}</div>}
    </div>
  );
}

function levelIcon(e: AuditEntry): string {
  if (e.category === "alarm") return "text-ltor-alarm";
  if (e.category === "warning") return "text-ltor-warn";
  if (e.action === "lab_exercise_completed") return "text-ltor-ok";
  return "text-ltor-mute";
}

export function TrainingPanel(props: {
  tab: TrainingTab;
  onTab: (t: TrainingTab) => void;
  connectionId?: string;
  model: LaserModel;
  v: SimValues;
  done: Set<string>;
  onQuizCorrect: () => void;
  part: LabPart | null;
}) {
  const { model, v } = props;
  const entries = useAuditStore((s) => s.entries);

  const log = useMemo(
    () =>
      entries
        .filter((e) => {
          const d = e.details ?? {};
          return d["connectionId"] === props.connectionId || d["id"] === props.connectionId;
        })
        .slice(0, 200),
    [entries, props.connectionId],
  );

  const now = explainState({
    state: str(v, "state", "OFF"),
    current: num(v, "current_mA"),
    threshold: num(v, "threshold_mA"),
    shutter: bool(v, "shutter"),
    junction: num(v, "junction_C", 22),
    maxJunction: model.maxJunctionC,
    absorption: model.dpss ? num(v, "absorption_pct") : undefined,
    kind: model.kind,
    shg: model.dpss?.shgCoeffPerW !== undefined,
  });

  const exercises = EXERCISES.filter((e) => !e.only || e.only.includes(model.kind));
  const doneCount = exercises.filter((e) => props.done.has(e.id)).length;
  const firstOpen = exercises.find((e) => !props.done.has(e.id));

  const tabs: { id: TrainingTab; label: string; icon: JSX.Element }[] = [
    { id: "now", label: "Was passiert?", icon: <Lightbulb size={12} /> },
    { id: "exercises", label: `Übungen ${doneCount}/${exercises.length}`, icon: <GraduationCap size={12} /> },
    { id: "log", label: "Protokoll", icon: <ScrollText size={12} /> },
    { id: "part", label: "Bauteil", icon: <Box size={12} /> },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b border-ltor-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => props.onTab(t.id)}
            className={clsx(
              "flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] border-b-2 -mb-px",
              props.tab === t.id ? "border-ltor-ink font-semibold" : "border-transparent text-ltor-mute hover:text-ltor-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 text-xs leading-relaxed">
        {props.tab === "now" && (
          <div className="space-y-2">
            {now.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {firstOpen && (
              <div className="mt-3 p-2 border border-ltor-line bg-neutral-50">
                <div className="text-[10px] uppercase tracking-wider text-ltor-mute">Nächste Übung</div>
                <div className="font-semibold">{firstOpen.title}</div>
                <div>{firstOpen.goal}</div>
              </div>
            )}
            <p className="text-[10px] text-ltor-mute pt-2">
              Tipp: Klicke im 3D-Bild auf ein Bauteil, um zu erfahren, wozu es dient und welche Physik dahinter steckt.
            </p>
          </div>
        )}

        {props.tab === "exercises" && (
          <ol className="space-y-3">
            {exercises.map((ex) => {
              const ok = props.done.has(ex.id);
              return (
                <li key={ex.id} className="flex gap-2">
                  {ok ?
                    <CheckCircle2 size={16} className="text-ltor-ok shrink-0 mt-0.5" />
                  : <Circle size={16} className="text-ltor-mute shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <div className={clsx("font-semibold", ok && "text-ltor-ok")}>{ex.title}</div>
                    <div>{ex.goal}</div>
                    <div className="text-ltor-mute">{ex.hint}</div>
                    {ex.id === "classify" && !ok && (
                      <Quiz model={model} connectionId={props.connectionId} onCorrect={props.onQuizCorrect} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {props.tab === "log" && (
          <div>
            <p className="text-[10px] text-ltor-mute mb-2">
              Alles, was du an diesem Gerät getan hast – und was das Gerät daraufhin gemeldet hat. Vollständig
              exportierbar im Modul „Audit-Log“.
            </p>
            {log.length === 0 ?
              <div className="text-ltor-mute">Noch keine Einträge.</div>
            : <ul className="space-y-1.5">
                {log.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="font-mono text-[10px] text-ltor-mute shrink-0 pt-px">
                      {new Date(e.ts).toLocaleTimeString("de-DE")}
                    </span>
                    <span className={clsx("shrink-0", levelIcon(e))}>●</span>
                    <span className="min-w-0">{describeAction(e.action, e.details)}</span>
                  </li>
                ))}
              </ul>
            }
          </div>
        )}

        {props.tab === "part" &&
          (props.part ?
            <div className="space-y-2">
              <div className="text-sm font-semibold">{PARTS[props.part].title}</div>
              <p>{PARTS[props.part].what}</p>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ltor-mute">Physik</div>
                <p>{PARTS[props.part].physics}</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ltor-mute">Praxis & Sicherheit</div>
                <p>{PARTS[props.part].practice}</p>
              </div>
            </div>
          : <div className="text-ltor-mute">Klicke im 3D-Bild auf ein Bauteil.</div>)}
      </div>
    </div>
  );
}

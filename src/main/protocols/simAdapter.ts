import type {
  SimConfig,
  SimLaserState,
  SimWriteChannel,
  TelemetrySample,
} from "@shared/types";
import { SIM_WRITE_CHANNELS } from "@shared/types";
import {
  LASER_MODELS,
  emissionWavelengthNm,
  operatingPoint,
  pumpWavelengthNm,
  type LaserModel,
} from "@shared/laserPhysics";
import { AdapterEmitter, type ProtocolAdapter } from "./adapter";

/** Lab ambient temperature [°C]. */
const AMBIENT_C = 22;
/** TEC plate time constant [s] and junction time constant [s]. */
const TAU_TEC_S = 3;
const TAU_JUNCTION_S = 0.3;
/** Delay between enabling emission and current flow (emission warning). */
const ARMING_MS = 3000;
/** Soft-start: full current range in this many seconds. */
const RAMP_FULL_SCALE_S = 3;
/** Physics integration step [s]. */
const STEP_S = 0.05;

const TEC_MIN_C = 10;
const TEC_MAX_C = 40;
const DEW_POINT_C = 15;

/** Normal-distributed random number (Box–Muller). */
function gauss(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function toBool(v: number | string | boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return ["1", "true", "on", "ein", "auf", "open"].includes(v.trim().toLowerCase());
}

function toNumber(v: number | string | boolean, channel: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (typeof v === "boolean" || !Number.isFinite(n)) {
    throw new Error(`${channel}: Zahlenwert erwartet`);
  }
  return n;
}

/**
 * Virtual laser device. Simulates a laser controller (current driver, TEC,
 * key switch, shutter, interlock) together with the laser physics from
 * `@shared/laserPhysics`. Never opens a network connection – which is why
 * it is the only adapter allowed in the public web demo.
 */
export class SimAdapter extends AdapterEmitter implements ProtocolAdapter {
  readonly kind = "sim" as const;

  private readonly model: LaserModel;
  private readonly rateHz: number;
  private readonly noise: number;

  private timer?: NodeJS.Timeout;
  private lastTick = 0;

  // Controller state
  private currentSetmA = 0;
  private currentmA = 0;
  private tecSetC = 25;
  private caseC = AMBIENT_C;
  private junctionC = AMBIENT_C;
  private emission = false;
  private armedAt = 0;
  private shutterOpen = false;
  private interlockClosed = true;
  private fault: { code: string; text: string } | null = null;
  private wasLasing = false;
  private lastLasingNotice = 0;

  constructor(
    public readonly id: string,
    config: SimConfig,
  ) {
    super();
    const model = LASER_MODELS[config.model];
    if (!model) throw new Error(`Unbekanntes Lasermodell: ${String(config.model)}`);
    this.model = model;
    this.rateHz = Math.min(10, Math.max(1, Math.round(config.sampleRateHz ?? 5)));
    this.noise = Math.min(1, Math.max(0, config.noise ?? 0.3));
  }

  async connect(): Promise<void> {
    this.emitStatus("connecting");
    // A real controller needs a moment for the handshake – so does ours.
    await new Promise((r) => setTimeout(r, 300));
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 1000 / this.rateHz);
    this.emitStatus("connected");
    this.emitNotice({
      level: "info",
      action: "sim_device_online",
      message:
        `${this.model.name} (${this.model.medium}) verbunden. Emission ist ` +
        "aus, Shutter geschlossen – der Laser startet immer im sicheren Zustand.",
      details: { model: this.model.id },
    });
    this.tick();
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.emitStatus("disconnected");
  }

  async write(channel: string, value: number | string | boolean): Promise<void> {
    if (!this.timer) throw new Error("Simulator ist nicht verbunden");
    if (!(SIM_WRITE_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error(
        `Unbekannter Kanal "${channel}". Schreibbar: ${SIM_WRITE_CHANNELS.join(", ")}`,
      );
    }
    const m = this.model;
    switch (channel as SimWriteChannel) {
      case "current_set_mA": {
        const want = toNumber(value, channel);
        const clamped = Math.min(m.maxCurrentmA, Math.max(0, want));
        if (want > m.maxCurrentmA) {
          this.emitNotice({
            level: "warning",
            action: "sim_current_limited",
            message:
              `Sollstrom ${want.toFixed(0)} mA über dem Maximum – auf ` +
              `${m.maxCurrentmA} mA begrenzt. Zu hoher Strom zerstört die ` +
              "Austrittsfacette der Diode (COD, catastrophic optical damage).",
            details: { requested: want, limit: m.maxCurrentmA },
          });
        }
        this.currentSetmA = clamped;
        break;
      }
      case "tec_set_C": {
        const want = toNumber(value, channel);
        if (want < TEC_MIN_C || want > TEC_MAX_C) {
          throw new Error(
            `TEC-Sollwert muss zwischen ${TEC_MIN_C} und ${TEC_MAX_C} °C liegen`,
          );
        }
        if (want < DEW_POINT_C) {
          this.emitNotice({
            level: "warning",
            action: "sim_tec_below_dewpoint",
            message:
              `TEC-Sollwert ${want.toFixed(1)} °C liegt unter dem Taupunkt der ` +
              `Laborluft (≈ ${DEW_POINT_C} °C). Kondenswasser auf Optik und ` +
              "Diode kann zu Kurzschluss oder Facettenschäden führen.",
            details: { setpoint: want, dewPoint: DEW_POINT_C },
          });
        }
        this.tecSetC = want;
        break;
      }
      case "emission": {
        const on = toBool(value);
        if (on && !this.emission) {
          if (!this.interlockClosed) {
            throw new Error(
              "Interlock offen – Emission kann nicht freigegeben werden. " +
                "Erst Interlock (z. B. Labortür) schließen.",
            );
          }
          if (this.fault) {
            throw new Error(
              `Störung aktiv (${this.fault.text}) – erst Fehler quittieren.`,
            );
          }
          this.emission = true;
          this.armedAt = Date.now() + ARMING_MS;
          this.emitNotice({
            level: "info",
            action: "sim_emission_arming",
            message:
              `Emission freigegeben. ${ARMING_MS / 1000} s Emissionsverzögerung: ` +
              "Die Warnleuchte zeigt an, dass gleich Laserstrahlung austreten kann.",
          });
          if (this.currentSetmA > 0) {
            this.emitNotice({
              level: "warning",
              action: "sim_enable_with_current",
              message:
                `Emission mit Sollstrom ${this.currentSetmA.toFixed(0)} mA ` +
                "freigegeben. Gute Praxis: erst bei 0 mA freigeben und den " +
                "Strom dann langsam hochfahren.",
              details: { currentSetmA: this.currentSetmA },
            });
          }
        } else if (!on && this.emission) {
          this.emission = false;
          this.emitNotice({
            level: "info",
            action: "sim_emission_off",
            message: "Emission abgeschaltet – der Diodenstrom wird heruntergefahren.",
          });
        }
        break;
      }
      case "shutter":
        this.shutterOpen = toBool(value);
        break;
      case "interlock": {
        const closed = toBool(value);
        if (!closed && this.interlockClosed) {
          const wasEmitting = this.emission;
          this.interlockClosed = false;
          this.emission = false;
          this.currentmA = 0;
          this.emitNotice({
            level: wasEmitting ? "alarm" : "warning",
            action: "sim_interlock_open",
            message: wasEmitting
              ? "Interlock ausgelöst – die Emission wurde sofort hart abgeschaltet. " +
                "Nach dem Schließen ist eine erneute, bewusste Freigabe nötig " +
                "(kein automatischer Wiederanlauf)."
              : "Interlock geöffnet. Solange er offen ist, kann keine Emission " +
                "freigegeben werden.",
          });
        } else if (closed && !this.interlockClosed) {
          this.interlockClosed = true;
        }
        break;
      }
      case "fault_reset": {
        if (!this.fault) return;
        if (this.junctionC > m.maxJunctionC - 5) {
          throw new Error(
            `Diode noch zu warm (${this.junctionC.toFixed(1)} °C). Quittieren ` +
              `erst unter ${(m.maxJunctionC - 5).toFixed(0)} °C möglich.`,
          );
        }
        this.emitNotice({
          level: "info",
          action: "sim_fault_reset",
          message: `Störung „${this.fault.text}“ quittiert.`,
        });
        this.fault = null;
        break;
      }
    }
    this.tick();
  }

  private state(now: number): SimLaserState {
    if (this.fault) return "FAULT";
    if (!this.interlockClosed) return "INTERLOCK";
    if (!this.emission) return "OFF";
    if (now < this.armedAt) return "ARMING";
    return this.wasLasing ? "LASING" : "ON";
  }

  /** Advance the physics to "now" and publish one telemetry frame. */
  private tick(): void {
    const now = Date.now();
    let elapsed = Math.min(2, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const m = this.model;
    let op = operatingPoint(m, this.currentmA, this.junctionC);

    while (elapsed > 1e-6) {
      const dt = Math.min(STEP_S, elapsed);
      elapsed -= dt;

      const driveEnabled =
        this.emission && now >= this.armedAt && this.interlockClosed && !this.fault;
      const target = driveEnabled ? this.currentSetmA : 0;
      const maxStep = (m.maxCurrentmA / RAMP_FULL_SCALE_S) * dt;
      const delta = target - this.currentmA;
      this.currentmA += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);

      op = operatingPoint(m, this.currentmA, this.junctionC);
      this.caseC += ((this.tecSetC - this.caseC) * dt) / TAU_TEC_S;
      const tjSteady = this.caseC + m.rthKpW * op.heatW;
      this.junctionC += ((tjSteady - this.junctionC) * dt) / TAU_JUNCTION_S;

      if (!this.fault && this.junctionC > m.maxJunctionC) {
        this.fault = { code: "OVERTEMP", text: "Übertemperatur" };
        this.currentmA = 0;
        this.emission = false;
        this.emitNotice({
          level: "alarm",
          action: "sim_fault_overtemp",
          message:
            `Übertemperatur: Sperrschicht ${this.junctionC.toFixed(1)} °C > ` +
            `${m.maxJunctionC} °C. Schutzabschaltung. Ursache meist zu hoher ` +
            "Strom bei zu warmem TEC-Sollwert – die Verlustwärme " +
            "(P_el − P_opt) kann nicht schnell genug abgeführt werden.",
          details: { junctionC: this.junctionC, limit: m.maxJunctionC },
        });
      }
    }

    op = operatingPoint(m, this.currentmA, this.junctionC);
    if (op.lasing !== this.wasLasing && now - this.lastLasingNotice > 5000) {
      this.lastLasingNotice = now;
      this.emitNotice({
        level: "info",
        action: op.lasing ? "sim_threshold_crossed" : "sim_below_threshold",
        message: op.lasing
          ? `Laserschwelle überschritten bei ${this.currentmA.toFixed(0)} mA: ` +
            "stimulierte Emission überwiegt, die Leistung steigt jetzt steil an."
          : "Unterhalb der Laserschwelle – nur noch schwache spontane Emission.",
        details: { currentmA: Math.round(this.currentmA) },
      });
    }
    this.wasLasing = op.lasing;

    this.publish(now, op);
  }

  private publish(now: number, op: ReturnType<typeof operatingPoint>): void {
    const n = this.noise;
    const m = this.model;
    const rin = 1 + gauss() * 0.004 * n;
    const laserMw = Math.max(0, op.outputW * 1000 * rin);
    const meterMw = this.shutterOpen
      ? Math.max(0, laserMw + gauss() * 0.01 * n)
      : Math.abs(gauss() * 0.005 * n);
    const pel = op.electricalW;

    const frame: Array<[string, TelemetrySample["value"], string?]> = [
      ["state", this.state(now)],
      ["emission", this.emission],
      ["shutter", this.shutterOpen],
      ["interlock", this.interlockClosed],
      ["fault", this.fault?.text ?? ""],
      ["current_set_mA", round(this.currentSetmA, 1), "mA"],
      ["current_mA", round(Math.max(0, this.currentmA + gauss() * 0.05 * n), 2), "mA"],
      ["voltage_V", round(op.voltageV + gauss() * 0.001 * n, 3), "V"],
      ["electrical_W", round(pel, 4), "W"],
      ["tec_set_C", round(this.tecSetC, 2), "°C"],
      ["case_C", round(this.caseC + gauss() * 0.02 * n, 2), "°C"],
      ["junction_C", round(this.junctionC + gauss() * 0.02 * n, 2), "°C"],
      ["threshold_mA", round(op.thresholdmA, 1), "mA"],
      ["diode_power_mW", round(op.diodeOpticalW * 1000, 2), "mW"],
      ["laser_power_mW", round(laserMw, 3), "mW"],
      ["power_mW", round(meterMw, 3), "mW"],
      ["wavelength_nm", round(emissionWavelengthNm(m, this.junctionC), 2), "nm"],
      ["efficiency_pct", round(pel > 0 ? (op.outputW / pel) * 100 : 0, 2), "%"],
    ];
    if (m.dpss) {
      frame.push(
        ["pump_wavelength_nm", round(pumpWavelengthNm(m, this.junctionC), 2), "nm"],
        ["absorption_pct", round((op.absorption ?? 0) * 100, 1), "%"],
      );
      if (m.dpss.shgCoeffPerW !== undefined) {
        frame.push(["fundamental_mW", round((op.fundamentalW ?? 0) * 1000, 2), "mW"]);
      }
    }
    for (const [channel, value, unit] of frame) {
      this.emitSample({ connectionId: this.id, channel, value, ts: now, unit });
    }
  }
}

function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

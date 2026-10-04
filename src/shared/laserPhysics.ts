// Laser physics used by the built-in laser simulator (backend) and the
// Laserlabor UI (frontend). Pure functions, no dependencies – keep it that way
// so it can run in Electron main, the Node server and the browser alike.
//
// The models are deliberately simplified teaching models. Every formula is a
// textbook relation (sources in the comments); parameters are typical values
// of real devices, not data of a specific product.

export type LaserModelId =
  | "diode405"
  | "dfb1550"
  | "diode808"
  | "dpss1064"
  | "dpss532";

export interface LaserModel {
  id: LaserModelId;
  name: string;
  /** Gain medium, shown to the user. */
  medium: string;
  kind: "diode" | "dpss";
  /** Emission wavelength at 25 °C junction temperature [nm]. */
  wavelengthNm: number;
  /** Thermal wavelength drift dλ/dT [nm/K] (0 for DPSS: atomic transition). */
  dLambdaDT: number;

  // ---- Laser diode (for DPSS: the 808 nm pump diode) ----
  /** Threshold current at 25 °C [mA]. */
  ithRefmA: number;
  /** Characteristic temperature T₀ [K]: I_th(T) = I_th,25 · exp((T−25)/T₀). */
  t0K: number;
  /** Slope efficiency at 25 °C [W/A]. */
  slopeWpA: number;
  /** Relative slope-efficiency loss per Kelvin [1/K]. */
  slopeTempCoeff: number;
  /** Diode turn-on voltage [V] and series resistance [Ω]: U = U₀ + R_s·I. */
  vf0: number;
  rsOhm: number;
  /** Maximum allowed drive current [mA] (driver limit, protects the facet). */
  maxCurrentmA: number;
  /** Thermal resistance junction → TEC plate [K/W]. */
  rthKpW: number;
  /** Junction temperature that trips the over-temperature protection [°C]. */
  maxJunctionC: number;

  // ---- DPSS only ----
  dpss?: {
    /** Pump diode wavelength at 25 °C [nm] (drifts with dLambdaDTPump). */
    pumpWavelengthNm: number;
    dLambdaDTPump: number;
    /** Absorption line of the crystal (Nd:YVO₄: 808.5 nm). */
    absorptionPeakNm: number;
    absorptionFwhmNm: number;
    absorptionPeak: number;
    absorptionFloor: number;
    /** Absorbed pump power needed to reach laser threshold [W]. */
    thresholdAbsW: number;
    /** Optical slope efficiency P_1064 / P_abs above threshold. */
    opticalSlope: number;
    /** Second-harmonic coefficient k in P_532 = k · P_1064² [1/W]. */
    shgCoeffPerW?: number;
  };

  /** Beam at the output aperture (collimated). */
  beam: {
    /** 1/e² waist radius [mm]. */
    w0Mm: number;
    /** Beam quality factor M². */
    m2: number;
  };

  /** Rated maximum output power [mW] → determines the laser class. */
  ratedPowerMw: number;
  /** Short scientific description (German UI text). */
  description: string;
  applications: string[];
}

export const LASER_MODELS: Record<LaserModelId, LaserModel> = {
  diode405: {
    id: "diode405",
    name: "Laserdiode 405 nm",
    medium: "InGaN/GaN (Halbleiter)",
    kind: "diode",
    wavelengthNm: 405,
    dLambdaDT: 0.05,
    ithRefmA: 30,
    t0K: 180,
    slopeWpA: 1.1,
    slopeTempCoeff: 0.003,
    vf0: 4.4,
    rsOhm: 4,
    maxCurrentmA: 140,
    rthKpW: 40,
    maxJunctionC: 60,
    beam: { w0Mm: 0.75, m2: 1.3 },
    ratedPowerMw: 120,
    description:
      "Violette Halbleiterlaserdiode. Elektronen und Löcher rekombinieren in " +
      "der InGaN-Quantenfilm-Schicht; oberhalb des Schwellstroms überwiegt " +
      "stimulierte Emission. GaN-Dioden haben eine hohe Durchlassspannung " +
      "(große Bandlücke ≈ 3 eV) und ein hohes T₀ – sie reagieren daher " +
      "vergleichsweise wenig auf Temperatur.",
    applications: ["Blu-ray", "Fluoreszenzmikroskopie", "Lithografie", "3D-Druck"],
  },
  dfb1550: {
    id: "dfb1550",
    name: "DFB-Laser 1550 nm",
    medium: "InGaAsP/InP (Halbleiter, DFB)",
    kind: "diode",
    wavelengthNm: 1550,
    dLambdaDT: 0.1,
    ithRefmA: 12,
    t0K: 60,
    slopeWpA: 0.25,
    slopeTempCoeff: 0.006,
    vf0: 1.0,
    rsOhm: 5,
    maxCurrentmA: 150,
    rthKpW: 60,
    maxJunctionC: 50,
    beam: { w0Mm: 1.0, m2: 1.05 },
    ratedPowerMw: 35,
    description:
      "Telekom-Laser mit verteilter Rückkopplung (DFB): ein Bragg-Gitter im " +
      "Wellenleiter erzwingt eine einzige Längsmode. Die Wellenlänge wird " +
      "über die Temperatur fein abgestimmt (≈ 0,1 nm/K). InGaAsP hat ein " +
      "niedriges T₀ ≈ 60 K – der Schwellstrom steigt bei Erwärmung stark an.",
    applications: ["Glasfaser-Kommunikation (C-Band)", "LiDAR", "Gas-Sensorik"],
  },
  diode808: {
    id: "diode808",
    name: "Hochleistungsdiode 808 nm",
    medium: "AlGaAs/GaAs (Halbleiter, Breitstreifen)",
    kind: "diode",
    wavelengthNm: 808,
    dLambdaDT: 0.28,
    ithRefmA: 300,
    t0K: 130,
    slopeWpA: 1.1,
    slopeTempCoeff: 0.004,
    vf0: 1.6,
    rsOhm: 0.15,
    maxCurrentmA: 2000,
    rthKpW: 8,
    maxJunctionC: 55,
    beam: { w0Mm: 1.5, m2: 10 },
    ratedPowerMw: 1900,
    description:
      "Breitstreifen-Laserdiode im Watt-Bereich, typische Pumpquelle für " +
      "Festkörperlaser. Der breite Emitter erlaubt hohe Leistung, schwingt " +
      "aber in vielen Transversalmoden (M² ≫ 1). Fabry-Pérot-Dioden driften " +
      "mit ≈ 0,28 nm/K – deutlich stärker als DFB-Laser.",
    applications: ["Pumpen von Nd:YAG/Nd:YVO₄", "Haarentfernung", "Materialbearbeitung"],
  },
  dpss1064: {
    id: "dpss1064",
    name: "DPSS-Laser 1064 nm",
    medium: "Nd:YVO₄ (Festkörper, diodengepumpt)",
    kind: "dpss",
    wavelengthNm: 1064.3,
    dLambdaDT: 0,
    ithRefmA: 250,
    t0K: 130,
    slopeWpA: 1.0,
    slopeTempCoeff: 0.004,
    vf0: 1.6,
    rsOhm: 0.15,
    maxCurrentmA: 2000,
    rthKpW: 8,
    maxJunctionC: 55,
    dpss: {
      pumpWavelengthNm: 805.5,
      dLambdaDTPump: 0.28,
      absorptionPeakNm: 808.5,
      absorptionFwhmNm: 2.5,
      absorptionPeak: 0.95,
      absorptionFloor: 0.3,
      thresholdAbsW: 0.15,
      opticalSlope: 0.5,
    },
    beam: { w0Mm: 0.5, m2: 1.1 },
    ratedPowerMw: 800,
    description:
      "Diodengepumpter Festkörperlaser. Eine 808-nm-Diode regt Nd³⁺-Ionen " +
      "im Kristall an; die Laserlinie bei 1064,3 nm ist ein atomarer " +
      "Übergang (⁴F₃/₂ → ⁴I₁₁/₂) und verschiebt sich praktisch nicht mit " +
      "der Temperatur. Die Temperatur der Pumpdiode muss aber so geregelt " +
      "werden, dass ihre Wellenlänge die schmale Absorptionslinie bei " +
      "808,5 nm trifft.",
    applications: ["Markieren & Gravieren", "Mikrobearbeitung", "Pumpquelle für OPOs"],
  },
  dpss532: {
    id: "dpss532",
    name: "DPSS-Laser 532 nm",
    medium: "Nd:YVO₄ + KTP (Frequenzverdopplung)",
    kind: "dpss",
    wavelengthNm: 532.1,
    dLambdaDT: 0,
    ithRefmA: 250,
    t0K: 130,
    slopeWpA: 1.0,
    slopeTempCoeff: 0.004,
    vf0: 1.6,
    rsOhm: 0.15,
    maxCurrentmA: 2000,
    rthKpW: 8,
    maxJunctionC: 55,
    dpss: {
      pumpWavelengthNm: 805.5,
      dLambdaDTPump: 0.28,
      absorptionPeakNm: 808.5,
      absorptionFwhmNm: 2.5,
      absorptionPeak: 0.95,
      absorptionFloor: 0.3,
      thresholdAbsW: 0.15,
      opticalSlope: 0.5,
      shgCoeffPerW: 0.4,
    },
    beam: { w0Mm: 0.5, m2: 1.1 },
    ratedPowerMw: 250,
    description:
      "Grüner Laser durch Frequenzverdopplung (SHG): Ein KTP-Kristall im " +
      "Resonator wandelt 1064-nm-Licht in 532 nm um. Weil SHG ein " +
      "nichtlinearer Prozess 2. Ordnung ist, wächst die grüne Leistung " +
      "quadratisch mit der Grundwellenleistung – die P-I-Kennlinie ist " +
      "oberhalb der Schwelle gekrümmt statt linear.",
    applications: ["Laserpointer", "Pumpen von Ti:Saphir", "Holografie", "Ophthalmologie"],
  },
};

export const LASER_MODEL_IDS = Object.keys(LASER_MODELS) as LaserModelId[];

export function isLaserModelId(v: unknown): v is LaserModelId {
  return typeof v === "string" && v in LASER_MODELS;
}

// ---------------------------------------------------------------------------
// Diode / pump physics
// ---------------------------------------------------------------------------

/** Threshold current [mA] at junction temperature tj [°C] (empirical T₀ law). */
export function thresholdmA(m: LaserModel, tjC: number): number {
  return m.ithRefmA * Math.exp((tjC - 25) / m.t0K);
}

/** Slope efficiency [W/A] at junction temperature tj [°C]. */
export function slopeEfficiency(m: LaserModel, tjC: number): number {
  return Math.max(0, m.slopeWpA * (1 - m.slopeTempCoeff * (tjC - 25)));
}

/** Diode forward voltage [V] at current [mA]. */
export function diodeVoltage(m: LaserModel, currentmA: number): number {
  if (currentmA <= 0) return 0;
  return m.vf0 + m.rsOhm * (currentmA / 1000);
}

/**
 * Optical power of the laser diode itself [W] (for DPSS: the pump diode).
 * Below threshold only weak spontaneous emission (LED operation).
 */
export function diodeOpticalW(m: LaserModel, currentmA: number, tjC: number): number {
  if (currentmA <= 0) return 0;
  const ith = thresholdmA(m, tjC);
  const eta = slopeEfficiency(m, tjC);
  const spont = 0.01 * eta * (Math.min(currentmA, ith) / 1000);
  if (currentmA <= ith) return spont;
  return spont + eta * ((currentmA - ith) / 1000);
}

/** Pump-diode wavelength [nm] (DPSS) at junction temperature. */
export function pumpWavelengthNm(m: LaserModel, tjC: number): number {
  if (!m.dpss) return emissionWavelengthNm(m, tjC);
  return m.dpss.pumpWavelengthNm + m.dpss.dLambdaDTPump * (tjC - 25);
}

/** Fraction of pump light absorbed in the crystal (Lorentzian line shape). */
export function pumpAbsorption(m: LaserModel, tjC: number): number {
  if (!m.dpss) return 1;
  const d = m.dpss;
  const delta = pumpWavelengthNm(m, tjC) - d.absorptionPeakNm;
  const lorentz = 1 / (1 + (2 * delta / d.absorptionFwhmNm) ** 2);
  return d.absorptionFloor + (d.absorptionPeak - d.absorptionFloor) * lorentz;
}

/** Emission wavelength [nm] at junction temperature. */
export function emissionWavelengthNm(m: LaserModel, tjC: number): number {
  return m.wavelengthNm + m.dLambdaDT * (tjC - 25);
}

export interface OperatingPoint {
  /** Laser output power inside the head (before the shutter) [W]. */
  outputW: number;
  /** Pump diode optical power (DPSS) or diode output (diode) [W]. */
  diodeOpticalW: number;
  /** DPSS: fundamental 1064 nm power [W]. */
  fundamentalW?: number;
  /** DPSS: absorbed fraction of pump light. */
  absorption?: number;
  voltageV: number;
  electricalW: number;
  /** Heat dissipated in the diode [W] = P_el − P_opt,diode. */
  heatW: number;
  thresholdmA: number;
  lasing: boolean;
}

/** Steady-state operating point for a given current and junction temperature. */
export function operatingPoint(m: LaserModel, currentmA: number, tjC: number): OperatingPoint {
  const i = Math.max(0, currentmA);
  const pDiode = diodeOpticalW(m, i, tjC);
  const u = diodeVoltage(m, i);
  const pel = u * (i / 1000);
  const heat = Math.max(0, pel - pDiode);
  const ith = thresholdmA(m, tjC);

  if (!m.dpss) {
    return {
      outputW: pDiode,
      diodeOpticalW: pDiode,
      voltageV: u,
      electricalW: pel,
      heatW: heat,
      thresholdmA: ith,
      lasing: i > ith,
    };
  }

  const d = m.dpss;
  const absorption = pumpAbsorption(m, tjC);
  const pAbs = pDiode * absorption;
  const fundamental = Math.max(0, d.opticalSlope * (pAbs - d.thresholdAbsW));
  const output =
    d.shgCoeffPerW !== undefined ? d.shgCoeffPerW * fundamental * fundamental : fundamental;
  return {
    outputW: output,
    diodeOpticalW: pDiode,
    fundamentalW: fundamental,
    absorption,
    voltageV: u,
    electricalW: pel,
    heatW: heat,
    thresholdmA: ith,
    lasing: fundamental > 0,
  };
}

/** Junction temperature in thermal equilibrium: T_j = T_TEC + R_th · P_heat. */
export function steadyJunctionC(m: LaserModel, currentmA: number, tecC: number): number {
  let tj = tecC;
  for (let k = 0; k < 8; k++) {
    tj = tecC + m.rthKpW * operatingPoint(m, currentmA, tj).heatW;
  }
  return tj;
}

/**
 * Current at which the laser starts to emit at the output (diode threshold,
 * or for DPSS the pump current that reaches the crystal's laser threshold).
 */
export function effectiveThresholdmA(m: LaserModel, tecC: number): number {
  if (!m.dpss) return thresholdmA(m, steadyJunctionC(m, thresholdmA(m, tecC), tecC));
  let lo = 0;
  let hi = m.maxCurrentmA;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    const tj = steadyJunctionC(m, mid, tecC);
    if (operatingPoint(m, mid, tj).lasing) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** P–I characteristic (steady state, including self-heating) for charts. */
export function piCurve(
  m: LaserModel,
  tecC: number,
  points = 60,
): { currentmA: number; powerMw: number }[] {
  const out: { currentmA: number; powerMw: number }[] = [];
  for (let k = 0; k <= points; k++) {
    const i = (m.maxCurrentmA * k) / points;
    const tj = steadyJunctionC(m, i, tecC);
    out.push({ currentmA: i, powerMw: operatingPoint(m, i, tj).outputW * 1000 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gaussian beam optics (Siegman, "Lasers", ch. 17; Saleh/Teich ch. 3)
// Real beams with M² > 1 are treated as "embedded Gaussian": all formulas use
// the effective wavelength λ·M².
// ---------------------------------------------------------------------------

/** Rayleigh range z_R = π·w₀² / (M²·λ). All lengths in metres. */
export function rayleighRange(w0: number, lambda: number, m2: number): number {
  return (Math.PI * w0 * w0) / (m2 * lambda);
}

/** Beam radius w(z) = w₀·√(1 + (z/z_R)²). */
export function beamRadius(w0: number, zR: number, z: number): number {
  return w0 * Math.sqrt(1 + (z / zR) ** 2);
}

/** Far-field half-angle divergence θ = M²·λ / (π·w₀) [rad]. */
export function divergence(w0: number, lambda: number, m2: number): number {
  return (m2 * lambda) / (Math.PI * w0);
}

/** Peak intensity of a Gaussian beam I₀ = 2P / (π·w²) [W/m²]. */
export function peakIntensity(powerW: number, w: number): number {
  return (2 * powerW) / (Math.PI * w * w);
}

export interface BeamSegment {
  /** Start and end position on the optical axis [m]. */
  zStart: number;
  zEnd: number;
  /** Waist radius and position of this segment [m]. */
  w0: number;
  zWaist: number;
  zR: number;
}

/**
 * Propagates a Gaussian beam through a thin lens with the complex beam
 * parameter q: 1/q' = 1/q − 1/f  (ABCD law).
 */
export function throughThinLens(
  seg: { w0: number; zWaist: number; zR: number },
  zLens: number,
  focal: number,
  lambdaEff: number,
): { w0: number; zWaist: number; zR: number } {
  // q = (z − z_w) + i·z_R at the lens
  const a = zLens - seg.zWaist;
  const b = seg.zR;
  // 1/q = (a − i b) / (a² + b²)
  const den = a * a + b * b;
  const re = a / den - 1 / focal;
  const im = -b / den;
  // q' = 1 / (re + i im) = (re − i im) / (re² + im²)
  const den2 = re * re + im * im;
  const qRe = re / den2;
  const qIm = -im / den2;
  const zR = qIm;
  const w0 = Math.sqrt((zR * lambdaEff) / Math.PI);
  return { w0, zWaist: zLens - qRe, zR };
}

/**
 * Beam path on the bench: laser aperture at z = 0, optional thin lens.
 * Returns segments before and after the lens.
 */
export function benchBeam(opts: {
  w0: number;
  lambda: number;
  m2: number;
  lens?: { z: number; focal: number };
  zEnd: number;
}): BeamSegment[] {
  const lambdaEff = opts.lambda * opts.m2;
  const zR0 = (Math.PI * opts.w0 * opts.w0) / lambdaEff;
  const first = { w0: opts.w0, zWaist: 0, zR: zR0 };
  if (!opts.lens || opts.lens.z <= 0 || opts.lens.z >= opts.zEnd) {
    return [{ zStart: 0, zEnd: opts.zEnd, ...first }];
  }
  const second = throughThinLens(first, opts.lens.z, opts.lens.focal, lambdaEff);
  return [
    { zStart: 0, zEnd: opts.lens.z, ...first },
    { zStart: opts.lens.z, zEnd: opts.zEnd, ...second },
  ];
}

/** Beam radius at position z on the bench [m]. */
export function radiusAt(segments: BeamSegment[], z: number): number {
  const seg =
    segments.find((s) => z >= s.zStart && z <= s.zEnd) ?? segments[segments.length - 1];
  return beamRadius(seg.w0, seg.zR, z - seg.zWaist);
}

// ---------------------------------------------------------------------------
// Laser safety – simplified CW values after IEC 60825-1 / ANSI Z136.1.
// Teaching values only. They do NOT replace a risk assessment by the laser
// safety officer (Laserschutzbeauftragte:r, TROS Laserstrahlung).
// ---------------------------------------------------------------------------

export type LaserClass = "1" | "2" | "3R" | "3B" | "4";

export function isVisible(lambdaNm: number): boolean {
  return lambdaNm >= 400 && lambdaNm <= 700;
}

/** Correction factor C4 (700–1400 nm) of IEC 60825-1. */
function c4(lambdaNm: number): number {
  if (lambdaNm < 700) return 1;
  if (lambdaNm < 1050) return 10 ** (0.002 * (lambdaNm - 700));
  return 5;
}

/**
 * Maximum permissible exposure (MPE) of the eye for CW irradiation [W/m²].
 * Visible: 0.25 s (aversion response); IR: 10 s exposure.
 */
export function mpeEyeWpm2(lambdaNm: number): number {
  if (lambdaNm < 400) return 10; // UV: not modelled in detail – conservative
  if (lambdaNm <= 700) return 25.4;
  if (lambdaNm <= 1400) return 10 * c4(lambdaNm);
  return 1000;
}

/** Accessible emission limit of class 1 for CW lasers [W]. */
export function ael1W(lambdaNm: number): number {
  if (lambdaNm <= 700) return 0.39e-3;
  if (lambdaNm <= 1400) return 0.39e-3 * c4(lambdaNm);
  return 10e-3;
}

/** Laser class for a given accessible CW power. */
export function laserClass(powerW: number, lambdaNm: number): LaserClass {
  const a1 = ael1W(lambdaNm);
  if (powerW <= a1) return "1";
  if (isVisible(lambdaNm) && powerW <= 1e-3) return "2";
  const limit3R = isVisible(lambdaNm) ? 5e-3 : 5 * a1;
  if (powerW <= limit3R) return "3R";
  if (powerW <= 0.5) return "3B";
  return "4";
}

/**
 * Nominal ocular hazard distance (NOHD) [m]:
 *   NOHD = (√(4P / (π·MPE)) − d₀) / φ
 * with beam diameter d₀ at the aperture and full divergence angle φ.
 */
export function nohdM(powerW: number, lambdaNm: number, d0: number, fullDivRad: number): number {
  if (powerW <= 0 || fullDivRad <= 0) return 0;
  const mpe = mpeEyeWpm2(lambdaNm);
  const d = Math.sqrt((4 * powerW) / (Math.PI * mpe));
  return Math.max(0, (d - d0) / fullDivRad);
}

/**
 * Optical density a protective eyewear must at least provide:
 * OD = log₁₀(E / MPE), irradiance E averaged over the 7 mm pupil aperture.
 */
export function requiredOD(powerW: number, lambdaNm: number, beamRadiusM: number): number {
  if (powerW <= 0) return 0;
  const pupil = Math.PI * 3.5e-3 * 3.5e-3;
  const beamArea = (Math.PI * beamRadiusM * beamRadiusM) / 2;
  const e = powerW / Math.max(pupil, beamArea);
  return Math.max(0, Math.ceil(Math.log10(e / mpeEyeWpm2(lambdaNm)) * 10) / 10);
}

// ---------------------------------------------------------------------------
// Colour of light (for the 3D view)
// ---------------------------------------------------------------------------

/**
 * Approximate sRGB colour of a wavelength (Bruton's algorithm). Invisible
 * wavelengths return null – the UI then uses a labelled false colour.
 */
export function wavelengthToRgb(lambdaNm: number): [number, number, number] | null {
  const l = lambdaNm;
  if (l < 380 || l > 750) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  if (l < 440) {
    r = -(l - 440) / 60;
    b = 1;
  } else if (l < 490) {
    g = (l - 440) / 50;
    b = 1;
  } else if (l < 510) {
    g = 1;
    b = -(l - 510) / 20;
  } else if (l < 580) {
    r = (l - 510) / 70;
    g = 1;
  } else if (l < 645) {
    r = 1;
    g = -(l - 645) / 65;
  } else {
    r = 1;
  }
  let f = 1;
  if (l < 420) f = 0.3 + (0.7 * (l - 380)) / 40;
  else if (l > 700) f = 0.3 + (0.7 * (750 - l)) / 50;
  return [r * f, g * f, b * f];
}

import { LENS_SHAPES, lensFeasible, type LensShape } from "@shared/laserPhysics";

/** One lens on the optical rail. */
export interface BenchLens {
  id: string;
  /** Position measured from the laser aperture [m]. */
  z: number;
  /** Signed focal length [mm] (negative = diverging). */
  focalMm: number;
  shape: LensShape;
}

export const MAX_LENSES = 5;
/** Lens carriages are 36 mm wide – keep at least this distance [m]. */
export const MIN_SPACING = 0.04;
export const RAIL = { min: 0.04, max: 0.6 };
/** Available focal lengths (magnitude) [mm]. */
export const FOCAL_LENGTHS_MM = [25, 50, 75, 100, 150, 200, 300];

let counter = 0;
export function newLensId(): string {
  counter += 1;
  return `L${Date.now().toString(36)}${counter}`;
}

export function sortLenses(lenses: BenchLens[]): BenchLens[] {
  return [...lenses].sort((a, b) => a.z - b.z);
}

/** Clamp a lens position so it stays on the rail and does not pass its neighbours. */
export function clampLensZ(lenses: BenchLens[], id: string, z: number): number {
  const sorted = sortLenses(lenses);
  const i = sorted.findIndex((l) => l.id === id);
  const lo = i > 0 ? sorted[i - 1].z + MIN_SPACING : RAIL.min;
  const hi = i < sorted.length - 1 ? sorted[i + 1].z - MIN_SPACING : RAIL.max;
  return Math.min(hi, Math.max(lo, z));
}

/** Largest free gap on the rail – where a new lens is placed. */
export function freeSpot(lenses: BenchLens[]): number | null {
  const zs = sortLenses(lenses).map((l) => l.z);
  const bounds = [RAIL.min - MIN_SPACING, ...zs, RAIL.max + MIN_SPACING];
  let best: { gap: number; z: number } | null = null;
  for (let k = 0; k < bounds.length - 1; k++) {
    const gap = bounds[k + 1] - bounds[k];
    if (gap >= 2 * MIN_SPACING && (!best || gap > best.gap)) {
      best = { gap, z: Math.min(RAIL.max, Math.max(RAIL.min, (bounds[k] + bounds[k + 1]) / 2)) };
    }
  }
  return best ? Math.round(best.z * 1000) / 1000 : null;
}

/** Sign of the focal length follows the lens shape. */
export function signedFocal(shape: LensShape, magnitudeMm: number): number {
  return LENS_SHAPES[shape].converging ? Math.abs(magnitudeMm) : -Math.abs(magnitudeMm);
}

/** Focal lengths offered for a shape (only physically feasible ones). */
export function focalOptions(shape: LensShape): number[] {
  return FOCAL_LENGTHS_MM.filter((f) => lensFeasible(shape, f)).map((f) => signedFocal(shape, f));
}

export function lensLabel(lenses: BenchLens[], id: string): string {
  const i = sortLenses(lenses).findIndex((l) => l.id === id);
  return `L${i + 1}`;
}

export function describeLens(l: BenchLens): string {
  return `f = ${l.focalMm > 0 ? "+" : "−"}${Math.abs(l.focalMm)} mm, ${LENS_SHAPES[l.shape].name}`;
}

export function opticsSummary(lenses: BenchLens[], planeZ: number): string {
  const s = sortLenses(lenses);
  const chain =
    s.length === 0 ?
      "ohne Linse"
    : s.map((l, i) => `L${i + 1} ${describeLens(l)} bei z = ${Math.round(l.z * 1000)} mm`).join(" · ");
  return `${chain}; Messebene bei z = ${Math.round(planeZ * 1000)} mm`;
}

const lens = (z: number, focalMm: number, shape: LensShape): BenchLens => ({
  id: newLensId(),
  z,
  focalMm,
  shape,
});

/** Ready-made set-ups – each one illustrates a classic arrangement. */
export const PRESETS: { id: string; title: string; hint: string; build: () => BenchLens[] }[] = [
  {
    id: "focus",
    title: "Fokussieren",
    hint: "Eine Plankonvexlinse f = 100 mm – der Fokus liegt ≈ f hinter der Linse.",
    build: () => [lens(0.25, 100, "planoconvex")],
  },
  {
    id: "kepler",
    title: "Kepler-Teleskop 1:3",
    hint:
      "f₁ = 50 mm und f₂ = 150 mm im Abstand f₁ + f₂ = 200 mm: der Strahl wird " +
      "dreifach aufgeweitet und bleibt kollimiert. Zwischen den Linsen liegt ein " +
      "reeller Fokus (Raumfilter-Position).",
    build: () => [lens(0.1, 50, "planoconvex"), lens(0.3, 150, "planoconvex")],
  },
  {
    id: "galilei",
    title: "Galilei-Teleskop 1:3",
    hint:
      "f₁ = −50 mm (Zerstreuungslinse) und f₂ = +150 mm im Abstand f₁ + f₂ = 100 mm: " +
      "gleiche Aufweitung, aber kürzer und ohne Zwischenfokus – gut für Hochleistungslaser.",
    build: () => [lens(0.15, -50, "planoconcave"), lens(0.25, 150, "planoconvex")],
  },
  {
    id: "relay",
    title: "4f-Relay 1:1",
    hint:
      "Zwei gleiche Bikonvexlinsen f = 75 mm im Abstand 2f = 150 mm: Der Strahl " +
      "kommt unverändert, aber um 4f versetzt heraus – das Prinzip jeder Relay-Optik.",
    build: () => [lens(0.15, 75, "biconvex"), lens(0.3, 75, "biconvex")],
  },
  {
    id: "empty",
    title: "Leere Bank",
    hint: "Alle Linsen entfernen – der Strahl bleibt nahezu kollimiert.",
    build: () => [],
  },
];

// Sanity checks of src/shared/laserPhysics.ts against textbook values.
// Run: npm run test:physics
import { build } from "esbuild";

const out = await build({
  entryPoints: ["src/shared/laserPhysics.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const P = await import(
  "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64")
);

let failed = 0;
function check(name, actual, expected, relTol = 0.02) {
  const ok = Math.abs(actual - expected) <= Math.abs(expected) * relTol + 1e-12;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}: ${actual.toPrecision(5)} (erwartet ≈ ${expected})`);
}

// Gaussian beam: HeNe-like beam, w0 = 0.5 mm, λ = 633 nm → zR = π w0²/λ = 1.2407 m
check("Rayleigh-Länge 633 nm, w0 0,5 mm [m]", P.rayleighRange(0.5e-3, 633e-9, 1), 1.2407);
check("w(z_R) = √2·w0 [mm]", P.beamRadius(0.5e-3, 1.2407, 1.2407) * 1e3, 0.70711);
check("Divergenz θ [mrad]", P.divergence(0.5e-3, 633e-9, 1) * 1e3, 0.40298);

// Thin lens: collimated beam (zR ≫ f) focuses to w0' ≈ λ f / (π w_in) at z ≈ f
const lam = 1064e-9;
const seg = { w0: 4e-3, zWaist: 0, zR: P.rayleighRange(4e-3, lam, 1) };
const foc = P.throughThinLens(seg, 0.1, 0.1, lam);
check("Fokus-Taille f=100 mm, w=4 mm [µm]", foc.w0 * 1e6, (lam * 0.1) / (Math.PI * 4e-3) * 1e6);
check("Fokus-Lage ≈ f hinter der Linse [mm]", (foc.zWaist - 0.1) * 1e3, 100, 0.01);

// T0 law: threshold rises by e when T rises by T0
const m = P.LASER_MODELS.dfb1550;
check("I_th(25 °C + T0) = e · I_th,25", P.thresholdmA(m, 25 + m.t0K) / m.ithRefmA, Math.E);

// DPSS: SHG output quadratic in fundamental
const g = P.LASER_MODELS.dpss532;
const tj = P.steadyJunctionC(g, 2000, 20);
const op = P.operatingPoint(g, 2000, tj);
check("SHG: P532 = k·P1064²", op.outputW, 0.4 * op.fundamentalW ** 2);
check("Pump-Absorption auf der Linie (808,5 nm)", P.pumpAbsorption(g, 25 + 3 / 0.28), 0.95);

// Safety: classes and MPE
const cls = (p, l) => P.laserClass(p, l);
const expectClass = (p, l, c) => {
  const ok = cls(p, l) === c;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} Klasse ${p * 1e3} mW @ ${l} nm = ${cls(p, l)} (erwartet ${c})`);
};
expectClass(0.3e-3, 532, "1");
expectClass(0.9e-3, 532, "2");
expectClass(4e-3, 532, "3R");
expectClass(0.2, 532, "3B");
expectClass(1, 1064, "4");
expectClass(35e-3, 1550, "3R");
check("MPE sichtbar [W/m²]", P.mpeEyeWpm2(532), 25.4);
check("MPE 1064 nm [W/m²]", P.mpeEyeWpm2(1064), 50);

// Rated powers of all models are reachable at max current, 20 °C TEC
for (const id of P.LASER_MODEL_IDS) {
  const mm = P.LASER_MODELS[id];
  const t = P.steadyJunctionC(mm, mm.maxCurrentmA, 20);
  const pmw = P.operatingPoint(mm, mm.maxCurrentmA, t).outputW * 1000;
  const ok = pmw > 0.5 * mm.ratedPowerMw && pmw < 1.3 * mm.ratedPowerMw && t < mm.maxJunctionC;
  if (!ok) failed++;
  console.log(
    `${ok ? "✓" : "✗"} ${mm.name}: ${pmw.toFixed(1)} mW bei I_max, T_j ${t.toFixed(1)} °C, ` +
      `I_th,eff ${P.effectiveThresholdmA(mm, 20).toFixed(0)} mA, Klasse ${P.laserClass(mm.ratedPowerMw / 1000, mm.wavelengthNm)}`,
  );
}

if (failed) {
  console.error(`\n${failed} Prüfung(en) fehlgeschlagen`);
  process.exit(1);
}
console.log("\nAlle Physik-Prüfungen bestanden.");

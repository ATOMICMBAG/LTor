import { useEffect, useState } from "react";
import { ChevronRight, Info, Calculator } from "lucide-react";
import { useAppStore } from "../../store/appStore";
import type { SystemInfo } from "@shared/types";
import { ipc } from "../../ipc";

// Small inline laser-physics calculators — first batch of "globale Werkzeuge".
function GaussSpotCalc() {
  const [wavelength, setWavelength] = useState(1064); // nm
  const [focal, setFocal] = useState(100); // mm
  const [beamDia, setBeamDia] = useState(8); // mm
  const [m2, setM2] = useState(1.0);

  // w0 ≈ (M² · λ · f) / (π · w_in)
  const lambda_m = wavelength * 1e-9;
  const f_m = focal * 1e-3;
  const w_in_m = (beamDia * 1e-3) / 2;
  const w0_m = (m2 * lambda_m * f_m) / (Math.PI * w_in_m);
  const w0_um = w0_m * 1e6;

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-ltor-mute">
        Fokus-Strahltaille w₀
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-ltor-mute">λ [nm]</span>
          <input
            type="number"
            className="input input-mono text-xs"
            value={wavelength}
            onChange={(e) => setWavelength(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-ltor-mute">f [mm]</span>
          <input
            type="number"
            className="input input-mono text-xs"
            value={focal}
            onChange={(e) => setFocal(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-ltor-mute">D [mm]</span>
          <input
            type="number"
            className="input input-mono text-xs"
            value={beamDia}
            onChange={(e) => setBeamDia(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-ltor-mute">M²</span>
          <input
            type="number"
            step="0.01"
            className="input input-mono text-xs"
            value={m2}
            onChange={(e) => setM2(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="mt-1 p-2 bg-neutral-50 border border-ltor-line">
        <div className="text-[10px] text-ltor-mute">w₀</div>
        <div className="font-mono text-sm">
          {Number.isFinite(w0_um) ? w0_um.toFixed(2) : "—"} µm
        </div>
      </div>
    </div>
  );
}

function PowerDensityCalc() {
  const [power, setPower] = useState(1); // W
  const [spot, setSpot] = useState(50); // µm
  const r_m = (spot * 1e-6) / 2;
  const area = Math.PI * r_m * r_m;
  const density = area > 0 ? power / area : 0;
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-ltor-mute">
        Leistungsdichte
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-ltor-mute">P [W]</span>
          <input
            type="number"
            className="input input-mono text-xs"
            value={power}
            onChange={(e) => setPower(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-ltor-mute">d [µm]</span>
          <input
            type="number"
            className="input input-mono text-xs"
            value={spot}
            onChange={(e) => setSpot(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="mt-1 p-2 bg-neutral-50 border border-ltor-line">
        <div className="text-[10px] text-ltor-mute">I = P / A</div>
        <div className="font-mono text-sm">{density.toExponential(2)} W/m²</div>
        <div className="font-mono text-[11px] text-ltor-mute">
          ≈ {(density / 1e4).toExponential(2)} W/cm²
        </div>
      </div>
    </div>
  );
}

function SystemInfoCard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    void ipc.sys
      .info()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);
  if (!info) return null;
  return (
    <div className="text-[11px] font-mono text-ltor-mute space-y-0.5">
      <div>
        Electron <span className="text-ltor-ink">{info.electronVersion}</span>
      </div>
      <div>
        Node <span className="text-ltor-ink">{info.nodeVersion}</span>
      </div>
      <div>
        Platform <span className="text-ltor-ink">{info.platform}</span>
      </div>
    </div>
  );
}

export function ToolsPanel() {
  const togglePanel = useAppStore((s) => s.togglePanel);

  return (
    <aside className="w-72 shrink-0 bg-white flex flex-col">
      <div className="panel-header">
        <span className="flex items-center gap-1.5">
          <Calculator size={12} /> Globale Werkzeuge
        </span>
        <button
          className="btn-ghost"
          title="Werkzeugleiste einklappen"
          onClick={() => togglePanel("tools")}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-4">
        <div className="panel p-3">
          <GaussSpotCalc />
        </div>
        <div className="panel p-3">
          <PowerDensityCalc />
        </div>
        <div className="panel p-3">
          <div className="text-[11px] uppercase tracking-wider text-ltor-mute mb-2 flex items-center gap-1">
            <Info size={11} /> System
          </div>
          <SystemInfoCard />
        </div>
      </div>
    </aside>
  );
}

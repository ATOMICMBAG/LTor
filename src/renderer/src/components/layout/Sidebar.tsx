import {
  LayoutDashboard,
  Activity,
  Plug,
  Camera,
  FileText,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { useAppStore, type ModuleId } from "../../store/appStore";
import clsx from "clsx";

interface NavItem {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
  hint: string;
}

const NAV: NavItem[] = [
  {
    id: "dashboard",
    label: "Übersicht",
    icon: LayoutDashboard,
    hint: "Status",
  },
  { id: "telemetry", label: "Telemetrie", icon: Activity, hint: "Live-Daten" },
  {
    id: "connections",
    label: "Verbindungen",
    icon: Plug,
    hint: "OPC UA · MQTT · REST",
  },
  { id: "sensors", label: "Sensoren", icon: Camera, hint: "Kamera · Mikrofon" },
  { id: "audit", label: "Audit-Log", icon: FileText, hint: "Protokoll" },
];

export function Sidebar() {
  const active = useAppStore((s) => s.activeModule);
  const setActive = useAppStore((s) => s.setActiveModule);
  const togglePanel = useAppStore((s) => s.togglePanel);

  return (
    <aside className="w-56 shrink-0 bg-white flex flex-col">
      <div className="panel-header">
        <span>Menü</span>
        <button
          className="btn-ghost"
          title="Menü einklappen"
          onClick={() => togglePanel("sidebar")}
        >
          <ChevronLeft size={14} />
        </button>
      </div>
      <nav className="flex-1 overflow-auto py-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={clsx(
                "w-full text-left px-3 py-2 flex items-center gap-2 border-l-2",
                isActive ?
                  "border-ltor-ink bg-neutral-50"
                : "border-transparent hover:bg-neutral-50",
              )}
            >
              <Icon size={16} />
              <div className="flex-1 min-w-0">
                <div className="text-sm leading-tight">{item.label}</div>
                <div className="text-[10px] text-ltor-mute leading-tight truncate">
                  {item.hint}
                </div>
              </div>
            </button>
          );
        })}
      </nav>
      <div className="px-3 py-2 text-[10px] text-ltor-mute border-t border-ltor-line">
        v0.1 · Phase 1+2
      </div>
    </aside>
  );
}

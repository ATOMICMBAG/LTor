import { useAppStore } from "../../store/appStore";
import { Maximize2, Minimize2, ChevronUp } from "lucide-react";

export function TitleBar() {
  const togglePanel = useAppStore((s) => s.togglePanel);
  const focusMode = useAppStore((s) => s.focusMode);
  const fullView = useAppStore((s) => s.fullView);

  return (
    <header className="h-10 border-b border-ltor-line bg-white flex items-center justify-between px-3 select-none">
      <div className="flex items-center gap-3">
        <div className="font-semibold tracking-tight">
          <span className="text-ltor-ink">maazi.de</span>
          <span className="text-ltor-ink"> | </span>
          <span className="text-ltor-ink">L</span>
          <span className="text-ltor-mute">Tor</span>
          <span className="ml-1 text-xs text-ltor-mute font-normal">
            Laser Laborplattform
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="btn-ghost"
          title="Fokus-Modus (alle Panels einklappen)"
          onClick={focusMode}
        >
          <Minimize2 size={14} />
        </button>
        <button
          className="btn-ghost"
          title="Vollansicht (alle Panels einblenden)"
          onClick={fullView}
        >
          <Maximize2 size={14} />
        </button>
        <button
          className="btn-ghost"
          title="Titelleiste einklappen"
          onClick={() => togglePanel("title")}
        >
          <ChevronUp size={14} />
        </button>
      </div>
    </header>
  );
}

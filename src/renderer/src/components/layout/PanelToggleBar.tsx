import { ChevronRight, ChevronLeft, PanelTop, PanelBottom } from "lucide-react";
import { useAppStore } from "../../store/appStore";

/**
 * Tiny edge bars that stay visible even when the corresponding side panel
 * is hidden, so the user can always bring panels back without keyboard tricks.
 */
export function PanelToggleBar({ side }: { side: "left" | "right" }) {
  const panels = useAppStore((s) => s.panels);
  const togglePanel = useAppStore((s) => s.togglePanel);

  // Show edge restore handle only when the corresponding panel is collapsed.
  if (side === "left" && panels.sidebar) return null;
  if (side === "right" && panels.tools) return null;

  return (
    <button
      className="w-3 hover:w-4 transition-all bg-white border-l border-r border-ltor-line flex items-center justify-center text-ltor-mute hover:text-ltor-ink"
      title={side === "left" ? "Menü einblenden" : "Werkzeuge einblenden"}
      onClick={() => togglePanel(side === "left" ? "sidebar" : "tools")}
    >
      {side === "left" ?
        <ChevronRight size={12} />
      : <ChevronLeft size={12} />}
    </button>
  );
}

/**
 * Floating restore buttons for title/status — shown only when those bars
 * are collapsed.
 */
export function CollapsedRestoreHandles() {
  const panels = useAppStore((s) => s.panels);
  const togglePanel = useAppStore((s) => s.togglePanel);
  return (
    <>
      {!panels.title && (
        <button
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50 px-2 py-0.5 bg-white border border-ltor-line text-[10px] text-ltor-mute hover:text-ltor-ink hover:bg-neutral-50 flex items-center gap-1"
          onClick={() => togglePanel("title")}
        >
          <PanelTop size={11} /> Titelleiste
        </button>
      )}
      {!panels.status && (
        <button
          className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 px-2 py-0.5 bg-white border border-ltor-line text-[10px] text-ltor-mute hover:text-ltor-ink hover:bg-neutral-50 flex items-center gap-1"
          onClick={() => togglePanel("status")}
        >
          <PanelBottom size={11} /> Statusleiste
        </button>
      )}
    </>
  );
}

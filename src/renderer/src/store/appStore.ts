import { create } from "zustand";

export type ModuleId =
  | "dashboard"
  | "telemetry"
  | "connections"
  | "sensors"
  | "audit";

export interface PanelVisibility {
  title: boolean;
  sidebar: boolean;
  status: boolean;
  tools: boolean;
}

interface AppState {
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;
  panels: PanelVisibility;
  togglePanel: (k: keyof PanelVisibility) => void;
  setPanel: (k: keyof PanelVisibility, v: boolean) => void;
  focusMode: () => void;
  fullView: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeModule: "dashboard",
  setActiveModule: (m) => set({ activeModule: m }),
  panels: {
    title: true,
    sidebar: true,
    status: true,
    tools: true,
  },
  togglePanel: (k) =>
    set((s) => ({ panels: { ...s.panels, [k]: !s.panels[k] } })),
  setPanel: (k, v) => set((s) => ({ panels: { ...s.panels, [k]: v } })),
  focusMode: () =>
    set({
      panels: { title: false, sidebar: false, status: false, tools: false },
    }),
  fullView: () => {
    void get;
    set({
      panels: { title: true, sidebar: true, status: true, tools: true },
    });
  },
}));

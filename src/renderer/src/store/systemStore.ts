import { create } from "zustand";
import type { ConnectionKind, SystemInfo } from "@shared/types";
import { ipc } from "../ipc";

interface SystemState {
  info: SystemInfo | null;
  load: () => Promise<void>;
}

/** Backend info (desktop / public demo / self-hosted server). */
export const useSystemStore = create<SystemState>((set) => ({
  info: null,
  async load() {
    try {
      set({ info: await ipc.sys.info() });
    } catch {
      set({ info: null });
    }
  },
}));

const ALL_KINDS: ConnectionKind[] = ["opcua", "mqtt", "rest", "sim"];

/** Connection kinds the current backend accepts. */
export function allowedKinds(info: SystemInfo | null): ConnectionKind[] {
  return info?.allowedKinds ?? ALL_KINDS;
}

import { create } from "zustand";
import type { AuditEntry } from "@shared/types";
import { ipc } from "../ipc";

const MAX_ENTRIES = 1000;

interface AuditState {
  entries: AuditEntry[];
  loading: boolean;
  refresh: (limit?: number) => Promise<void>;
  ingest: (e: AuditEntry) => void;
  clear: () => Promise<void>;
}

export const useAuditStore = create<AuditState>((set) => ({
  entries: [],
  loading: false,
  async refresh(limit = 500) {
    set({ loading: true });
    try {
      const list = await ipc.audit.list(limit);
      set({ entries: list, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  ingest(e) {
    set((s) => {
      // newest first
      const next = [e, ...s.entries];
      if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
      return { entries: next };
    });
  },
  async clear() {
    await ipc.audit.clear();
    set({ entries: [] });
  },
}));

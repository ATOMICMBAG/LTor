import { create } from "zustand";
import type { Connection, ConnectionStatus } from "@shared/types";
import { ipc } from "../ipc";

interface ConnectionsState {
  connections: Connection[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  applyStatus: (
    id: string,
    status: ConnectionStatus,
    error: string | undefined,
  ) => void;
  remove: (id: string) => void;
  upsert: (conn: Connection) => void;
}

export const useConnectionsStore = create<ConnectionsState>((set) => ({
  connections: [],
  loading: false,
  async refresh() {
    set({ loading: true, error: undefined });
    try {
      const list = await ipc.connections.list();
      set({ connections: list, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
  applyStatus(id, status, error) {
    set((s) => ({
      connections: s.connections.map((c) =>
        c.id === id ? { ...c, status, lastError: error } : c,
      ),
    }));
  },
  remove(id) {
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id) }));
  },
  upsert(conn) {
    set((s) => {
      const idx = s.connections.findIndex((c) => c.id === conn.id);
      if (idx < 0) return { connections: [...s.connections, conn] };
      const next = s.connections.slice();
      next[idx] = conn;
      return { connections: next };
    });
  },
}));

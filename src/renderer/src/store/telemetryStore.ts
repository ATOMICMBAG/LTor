import { create } from "zustand";
import type { TelemetrySample } from "@shared/types";

/** Per-channel ring buffer of telemetry samples. */
const MAX_POINTS_PER_CHANNEL = 600; // ~ 10 min @ 1Hz, or 1 min @ 10Hz

interface ChannelData {
  connectionId: string;
  channel: string;
  samples: TelemetrySample[];
  last?: TelemetrySample;
}

type ChannelKey = string; // `${connectionId}::${channel}`

interface TelemetryState {
  channels: Map<ChannelKey, ChannelData>;
  /** monotonic counter so React re-renders on map mutation */
  rev: number;
  ingest: (s: TelemetrySample) => void;
  clear: (connectionId?: string) => void;
  get: (connectionId: string, channel: string) => ChannelData | undefined;
  listForConnection: (connectionId: string) => ChannelData[];
}

export function channelKey(connectionId: string, channel: string): ChannelKey {
  return `${connectionId}::${channel}`;
}

export const useTelemetryStore = create<TelemetryState>((set, getState) => ({
  channels: new Map(),
  rev: 0,
  ingest(s) {
    set((state) => {
      const key = channelKey(s.connectionId, s.channel);
      const existing = state.channels.get(key);
      const samples = existing ? existing.samples.slice() : [];
      samples.push(s);
      if (samples.length > MAX_POINTS_PER_CHANNEL) {
        samples.splice(0, samples.length - MAX_POINTS_PER_CHANNEL);
      }
      const next = new Map(state.channels);
      next.set(key, {
        connectionId: s.connectionId,
        channel: s.channel,
        samples,
        last: s,
      });
      return { channels: next, rev: state.rev + 1 };
    });
  },
  clear(connectionId) {
    set((state) => {
      if (!connectionId) {
        return { channels: new Map(), rev: state.rev + 1 };
      }
      const next = new Map(state.channels);
      for (const k of Array.from(next.keys())) {
        if (k.startsWith(`${connectionId}::`)) next.delete(k);
      }
      return { channels: next, rev: state.rev + 1 };
    });
  },
  get(connectionId, channel) {
    return getState().channels.get(channelKey(connectionId, channel));
  },
  listForConnection(connectionId) {
    const out: ChannelData[] = [];
    for (const c of getState().channels.values()) {
      if (c.connectionId === connectionId) out.push(c);
    }
    return out;
  },
}));

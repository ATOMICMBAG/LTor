import { create } from "zustand";
import { ipc } from "../ipc";

export type SensorKind = "camera" | "microphone";

export interface SensorDevice {
  deviceId: string;
  label: string;
  kind: SensorKind;
}

interface SensorsState {
  devices: SensorDevice[];
  cameraStream?: MediaStream;
  microphoneStream?: MediaStream;
  selectedCameraId?: string;
  selectedMicrophoneId?: string;
  /** Independent audio analyser node so we can render a level meter. */
  micAnalyser?: AnalyserNode;
  micLevel: number; // 0..1
  error?: string;

  refreshDevices: () => Promise<void>;
  startCamera: (deviceId?: string) => Promise<void>;
  stopCamera: () => Promise<void>;
  switchCamera: (deviceId: string) => Promise<void>;
  startMicrophone: (deviceId?: string) => Promise<void>;
  stopMicrophone: () => Promise<void>;
  switchMicrophone: (deviceId: string) => Promise<void>;
}

let audioContext: AudioContext | undefined;
let micRafHandle: number | undefined;

function stopTracks(stream?: MediaStream) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

async function ensureDeviceLabels(): Promise<void> {
  // After permission is granted, labels become available.
  // No-op if permissions weren't granted — caller will see empty labels.
  await navigator.mediaDevices.enumerateDevices();
}

async function logAudit(action: string, details?: Record<string, unknown>) {
  try {
    await ipc.audit.append({
      category: "sensor",
      actor: "user",
      action,
      details,
    });
  } catch {
    // ignore — audit log shouldn't break sensor flow
  }
}

export const useSensorsStore = create<SensorsState>((set, get) => ({
  devices: [],
  micLevel: 0,

  async refreshDevices() {
    try {
      await ensureDeviceLabels();
      const all = await navigator.mediaDevices.enumerateDevices();
      const devices: SensorDevice[] = all
        .filter((d) => d.kind === "videoinput" || d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label:
            d.label ||
            (d.kind === "videoinput" ? "Kamera" : "Mikrofon") + " (anonym)",
          kind: d.kind === "videoinput" ? "camera" : "microphone",
        }));
      set({ devices, error: undefined });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  async startCamera(deviceId) {
    const { cameraStream } = get();
    if (cameraStream) await get().stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      const usedId =
        stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId;
      set({
        cameraStream: stream,
        selectedCameraId: usedId,
        error: undefined,
      });
      await get().refreshDevices();
      void logAudit("camera_enabled", { deviceId: usedId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      void logAudit("camera_enable_failed", { error: msg });
      throw e;
    }
  },

  async stopCamera() {
    const { cameraStream, selectedCameraId } = get();
    stopTracks(cameraStream);
    set({ cameraStream: undefined });
    if (cameraStream) {
      void logAudit("camera_disabled", { deviceId: selectedCameraId });
    }
  },

  async switchCamera(deviceId) {
    const prev = get().selectedCameraId;
    await get().stopCamera();
    await get().startCamera(deviceId);
    void logAudit("camera_switched", { from: prev, to: deviceId });
  },

  async startMicrophone(deviceId) {
    const { microphoneStream } = get();
    if (microphoneStream) await get().stopMicrophone();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false,
      });
      const usedId =
        stream.getAudioTracks()[0]?.getSettings().deviceId ?? deviceId;

      // Build a simple level meter.
      audioContext = audioContext ?? new AudioContext();
      if (audioContext.state === "suspended") await audioContext.resume();
      const src = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);

      const buffer = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!get().microphoneStream) return;
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        set({ micLevel: Math.min(1, rms * 4) });
        micRafHandle = requestAnimationFrame(tick);
      };

      set({
        microphoneStream: stream,
        selectedMicrophoneId: usedId,
        micAnalyser: analyser,
        error: undefined,
      });
      micRafHandle = requestAnimationFrame(tick);
      await get().refreshDevices();
      void logAudit("microphone_enabled", { deviceId: usedId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg });
      void logAudit("microphone_enable_failed", { error: msg });
      throw e;
    }
  },

  async stopMicrophone() {
    const { microphoneStream, selectedMicrophoneId } = get();
    if (micRafHandle !== undefined) {
      cancelAnimationFrame(micRafHandle);
      micRafHandle = undefined;
    }
    stopTracks(microphoneStream);
    set({
      microphoneStream: undefined,
      micAnalyser: undefined,
      micLevel: 0,
    });
    if (microphoneStream) {
      void logAudit("microphone_disabled", { deviceId: selectedMicrophoneId });
    }
  },

  async switchMicrophone(deviceId) {
    const prev = get().selectedMicrophoneId;
    await get().stopMicrophone();
    await get().startMicrophone(deviceId);
    void logAudit("microphone_switched", { from: prev, to: deviceId });
  },
}));

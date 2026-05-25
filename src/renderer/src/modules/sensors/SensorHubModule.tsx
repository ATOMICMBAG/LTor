import { useEffect, useRef } from "react";
import { useSensorsStore } from "../../store/sensorsStore";
import { Camera, Mic, CameraOff, MicOff, RefreshCw } from "lucide-react";

export function SensorHubModule() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const devices = useSensorsStore((s) => s.devices);
  const cameras = devices.filter((d) => d.kind === "camera");
  const microphones = devices.filter((d) => d.kind === "microphone");
  const selectedCameraId = useSensorsStore((s) => s.selectedCameraId);
  const selectedMicId = useSensorsStore((s) => s.selectedMicrophoneId);
  const cameraStream = useSensorsStore((s) => s.cameraStream);
  const microphoneStream = useSensorsStore((s) => s.microphoneStream);
  const micLevel = useSensorsStore((s) => s.micLevel);
  const error = useSensorsStore((s) => s.error);

  const refreshDevices = useSensorsStore((s) => s.refreshDevices);
  const startCamera = useSensorsStore((s) => s.startCamera);
  const stopCamera = useSensorsStore((s) => s.stopCamera);
  const startMic = useSensorsStore((s) => s.startMicrophone);
  const stopMic = useSensorsStore((s) => s.stopMicrophone);
  const switchCamera = useSensorsStore((s) => s.switchCamera);
  const switchMicrophone = useSensorsStore((s) => s.switchMicrophone);

  const selectCamera = (id: string | null) => {
    if (id) void switchCamera(id);
  };
  const selectMic = (id: string | null) => {
    if (id) void switchMicrophone(id);
  };

  // Bind camera stream to the <video> element whenever it changes.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = cameraStream ?? null;
    }
  }, [cameraStream]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sensor-Hub</h1>
          <p className="text-sm text-ltor-mute mt-1">
            Bordeigene Kamera und Mikrofon der Workstation einbinden.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => void refreshDevices()}>
          <RefreshCw size={14} /> Geräte neu laden
        </button>
      </div>

      {error && (
        <div className="text-sm text-ltor-alarm bg-red-50 border border-ltor-alarm/50 p-2">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Camera */}
        <div className="panel">
          <div className="panel-header">
            <span className="flex items-center gap-1.5">
              <Camera size={12} /> Kamera
            </span>
            <span className="font-mono text-ltor-mute">
              {cameraStream ? "AKTIV" : "AUS"}
            </span>
          </div>
          <div className="p-3 space-y-3">
            <div className="aspect-video bg-black flex items-center justify-center text-ltor-mute">
              {cameraStream ?
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
              : <span className="text-xs">Keine Vorschau</span>}
            </div>
            <div>
              <label className="label">Gerät</label>
              <select
                className="input text-xs"
                value={selectedCameraId ?? ""}
                onChange={(e) => selectCamera(e.target.value || null)}
              >
                <option value="">– Standard –</option>
                {cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Kamera ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              {cameraStream ?
                <button className="btn" onClick={() => stopCamera()}>
                  <CameraOff size={14} /> Stoppen
                </button>
              : <button className="btn" onClick={() => void startCamera()}>
                  <Camera size={14} /> Starten
                </button>
              }
            </div>
          </div>
        </div>

        {/* Microphone */}
        <div className="panel">
          <div className="panel-header">
            <span className="flex items-center gap-1.5">
              <Mic size={12} /> Mikrofon
            </span>
            <span className="font-mono text-ltor-mute">
              {microphoneStream ? "AKTIV" : "AUS"}
            </span>
          </div>
          <div className="p-3 space-y-3">
            <div className="aspect-video bg-neutral-50 border border-ltor-line flex flex-col items-center justify-center gap-3 p-4">
              <Mic
                size={36}
                className={
                  microphoneStream ? "text-ltor-ok" : (
                    "text-ltor-mute opacity-40"
                  )
                }
              />
              <div className="w-full max-w-xs h-3 bg-neutral-200 overflow-hidden border border-ltor-line">
                <div
                  className="h-full bg-ltor-ok transition-[width] duration-75"
                  style={{ width: `${Math.round(micLevel * 100)}%` }}
                />
              </div>
              <div className="font-mono text-xs text-ltor-mute">
                Pegel: {(micLevel * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <label className="label">Gerät</label>
              <select
                className="input text-xs"
                value={selectedMicId ?? ""}
                onChange={(e) => selectMic(e.target.value || null)}
              >
                <option value="">– Standard –</option>
                {microphones.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Mikro ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              {microphoneStream ?
                <button className="btn" onClick={() => stopMic()}>
                  <MicOff size={14} /> Stoppen
                </button>
              : <button className="btn" onClick={() => void startMic()}>
                  <Mic size={14} /> Starten
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

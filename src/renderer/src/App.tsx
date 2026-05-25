import { useEffect } from "react";
import { useAppStore } from "./store/appStore";
import { useConnectionsStore } from "./store/connectionsStore";
import { useAuditStore } from "./store/auditStore";
import { useTelemetryStore } from "./store/telemetryStore";
import { useSensorsStore } from "./store/sensorsStore";
import { ipc } from "./ipc";

import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { ToolsPanel } from "./components/layout/ToolsPanel";
import {
  PanelToggleBar,
  CollapsedRestoreHandles,
} from "./components/layout/PanelToggleBar";

import { DashboardModule } from "./modules/dashboard/DashboardModule";
import { ConnectionsModule } from "./modules/connections/ConnectionsModule";
import { TelemetryModule } from "./modules/telemetry/TelemetryModule";
import { SensorHubModule } from "./modules/sensors/SensorHubModule";
import { AuditLogModule } from "./modules/audit/AuditLogModule";

export default function App() {
  const activeModule = useAppStore((s) => s.activeModule);
  const panels = useAppStore((s) => s.panels);

  const refreshConnections = useConnectionsStore((s) => s.refresh);
  const applyStatus = useConnectionsStore((s) => s.applyStatus);

  const refreshAudit = useAuditStore((s) => s.refresh);
  const ingestAudit = useAuditStore((s) => s.ingest);

  const ingestTelemetry = useTelemetryStore((s) => s.ingest);

  const refreshDevices = useSensorsStore((s) => s.refreshDevices);

  // Bootstrap
  useEffect(() => {
    void refreshConnections();
    void refreshAudit(500);
    void refreshDevices();
  }, [refreshConnections, refreshAudit, refreshDevices]);

  // Subscribe to live IPC events
  useEffect(() => {
    const offStatus = ipc.connections.onStatus(
      ({ connectionId, status, error }) => {
        applyStatus(connectionId, status, error);
      },
    );
    const offTel = ipc.connections.onTelemetry((s) => ingestTelemetry(s));
    const offAudit = ipc.audit.onEntry((e) => ingestAudit(e));
    return () => {
      offStatus();
      offTel();
      offAudit();
    };
  }, [applyStatus, ingestTelemetry, ingestAudit]);

  // Refresh devices when MediaDevices list changes
  useEffect(() => {
    const handler = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [refreshDevices]);

  return (
    <div className="h-full w-full flex flex-col bg-ltor-paper text-ltor-ink select-none">
      {panels.title && <TitleBar />}

      <div className="flex-1 flex min-h-0">
        {/* Edge toggles always visible */}
        <PanelToggleBar side="left" />
        {panels.sidebar && <Sidebar />}

        <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-neutral-50 border-l border-r border-ltor-line overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            {activeModule === "dashboard" && <DashboardModule />}
            {activeModule === "connections" && <ConnectionsModule />}
            {activeModule === "telemetry" && <TelemetryModule />}
            {activeModule === "sensors" && <SensorHubModule />}
            {activeModule === "audit" && <AuditLogModule />}
          </div>
        </main>

        {panels.tools && <ToolsPanel />}
        <PanelToggleBar side="right" />
      </div>

      {panels.status && <StatusBar />}

      <CollapsedRestoreHandles />
    </div>
  );
}

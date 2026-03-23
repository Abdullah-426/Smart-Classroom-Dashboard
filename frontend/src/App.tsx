import { useEffect, useMemo, useState } from "react";
import { AiReportCard } from "./components/dashboard/AiReportCard";
import { AcControlCard } from "./components/dashboard/AcControlCard";
import { AttendanceTrackerPage } from "./components/dashboard/AttendanceTrackerPage";
import { AlertsBanner } from "./components/dashboard/AlertsBanner";
import { AnalyticsCard } from "./components/dashboard/AnalyticsCard";
import { DeviceGridsCard } from "./components/dashboard/DeviceGridsCard";
import { ControlsCard } from "./components/dashboard/ControlsCard";
import { HeaderBar } from "./components/dashboard/HeaderBar";
import { MlInsightsCard } from "./components/dashboard/MlInsightsCard";
import { StatusCard } from "./components/dashboard/StatusCard";
import { TemperatureCard } from "./components/dashboard/TemperatureCard";
import { StoragePanel } from "./components/dashboard/StoragePanel";
import { TemperatureTrendCard } from "./components/dashboard/TemperatureTrendCard";
import { useDashboardData } from "./hooks/useDashboardData";
import { dashboardApi } from "./services/api";
import type { AppRouteId } from "./components/dashboard/SideNav";
import type { CommandPayload } from "./types/dashboard";

function App() {
  const {
    bundle,
    trendLineLive,
    trendRangeId,
    setTrendRangeId,
    scheduleState,
    applyScheduleAfterToggle,
    loading,
    error,
    lastUpdated,
    pipelineConnected,
    storageInfo,
    clearPersistedStorage,
    resetDowntimeTimer,
    alerts,
    refresh,
    storedOccupancySessionKeys,
    occupancyCurrentSession,
  } = useDashboardData();
  const [commandNotice, setCommandNotice] = useState<string>("");

  const [route, setRoute] = useState<AppRouteId>(() => {
    const h = (window.location.hash || "").replace("#", "").toLowerCase();
    return h === "attendance" ? "attendance" : "home";
  });

  useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || "").replace("#", "").toLowerCase();
      setRoute(h === "attendance" ? "attendance" : "home");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function navigate(next: AppRouteId) {
    if (next === "home") {
      window.location.hash = "";
      return;
    }
    window.location.hash = "#attendance";
  }

  async function handleSendCommand(command: CommandPayload) {
    const result = await dashboardApi.sendCommand(command);
    if (result.ok) {
      setCommandNotice(`Command sent: ${JSON.stringify(command)}`);
    } else {
      setCommandNotice(`Command failed: ${result.error ?? "Unknown error"} (${JSON.stringify(command)})`);
    }
    // Resync telemetry + schedule state so Controls never sits on stale UI after commands.
    void refresh();
  }

  async function handleToggleSchedule() {
    try {
      const result = await dashboardApi.toggleSchedule();
      applyScheduleAfterToggle(result);
      setCommandNotice(
        `Schedule ${result.scheduleEnabled ? "enabled" : "disabled"} (forceOff: ${
          result.command.forceOff
        }, afterHoursAlert: ${result.command.afterHoursAlert})`,
      );
    } catch (e) {
      setCommandNotice(
        `Schedule toggle error: ${e instanceof Error ? e.message : "Unknown"}. Refreshing state…`,
      );
    } finally {
      void refresh();
    }
  }

  const alertValues = useMemo(() => alerts, [alerts]);

  if (loading && !bundle) {
    return (
      <main className="mx-auto max-w-7xl p-6 text-sm text-slate-500 dark:text-slate-400">
        Loading smart classroom dashboard...
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="mx-auto max-w-7xl p-6 text-sm text-rose-600 dark:text-rose-400">
        Failed to load dashboard data.
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-7xl">
        <HeaderBar
          route={route}
          onNavigate={navigate}
          lastUpdated={lastUpdated}
          pipelineConnected={pipelineConnected}
          onRefresh={refresh}
        />
        <AlertsBanner alerts={alertValues} />

          {error ? (
            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
              API warning: {error}. Mock fallback is active.
            </div>
          ) : null}

          {commandNotice ? (
            <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2 text-xs text-sky-700 dark:border-sky-900 dark:bg-sky-900/20 dark:text-sky-200">
              {commandNotice}
            </div>
          ) : null}

          <div key={route} className="page-fade">
            {route === "attendance" ? (
              <AttendanceTrackerPage />
            ) : (
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                <StatusCard
                  summary={bundle.summary}
                  className="lg:h-full lg:overflow-hidden"
                />
                <TemperatureCard
                  telemetry={bundle.telemetry}
                  trend={bundle.trend}
                  trendLineLive={trendLineLive}
                  className="lg:h-full lg:overflow-hidden"
                />
                <ControlsCard
                  telemetry={bundle.telemetry}
                  onSendCommand={handleSendCommand}
                  onToggleSchedule={handleToggleSchedule}
                  scheduleState={scheduleState}
                />

                <DeviceGridsCard telemetry={bundle.telemetry} />
                <AcControlCard
                  telemetry={bundle.telemetry}
                  onSendCommand={handleSendCommand}
                  className="lg:col-start-3"
                />

                <AnalyticsCard
                  summary={bundle.summary}
                  downtimeMs={storageInfo?.downtimeDisplayMs ?? 0}
                  onResetDowntime={resetDowntimeTimer}
                  occupancyCurrentSession={occupancyCurrentSession}
                  storedOccupancySessionKeys={storedOccupancySessionKeys}
                  onRefresh={refresh}
                  className="lg:col-start-4"
                />
                <TemperatureTrendCard
                  trend={bundle.trend}
                  rangeId={trendRangeId}
                  onRangeChange={setTrendRangeId}
                  className="lg:col-start-1 lg:row-start-3"
                />
                <MlInsightsCard ml={bundle.ml} className="lg:col-start-1 lg:col-span-2 lg:row-start-4" />
                <AiReportCard className="lg:col-start-3 lg:col-span-2 lg:row-start-4" />
                <StoragePanel storageInfo={storageInfo} onClearStorage={clearPersistedStorage} />
              </section>
            )}
          </div>
      </div>
    </main>
  );
}

export default App;

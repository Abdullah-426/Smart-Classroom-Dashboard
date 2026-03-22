import { useMemo, useState } from "react";
import { AiReportCard } from "./components/dashboard/AiReportCard";
import { AlertsBanner } from "./components/dashboard/AlertsBanner";
import { AnalyticsCard } from "./components/dashboard/AnalyticsCard";
import { ControlsCard } from "./components/dashboard/ControlsCard";
import { HeaderBar } from "./components/dashboard/HeaderBar";
import { MlInsightsCard } from "./components/dashboard/MlInsightsCard";
import { StatusCard } from "./components/dashboard/StatusCard";
import { TemperatureCard } from "./components/dashboard/TemperatureCard";
import { TemperatureTrendCard } from "./components/dashboard/TemperatureTrendCard";
import { useDashboardData } from "./hooks/useDashboardData";
import { dashboardApi } from "./services/api";
import type { CommandPayload } from "./types/dashboard";

function App() {
  const {
    bundle,
    scheduleState,
    applyScheduleAfterToggle,
    loading,
    error,
    lastUpdated,
    pipelineConnected,
    alerts,
    refresh,
  } = useDashboardData();
  const [commandNotice, setCommandNotice] = useState<string>("");

  async function handleSendCommand(command: CommandPayload) {
    await dashboardApi.sendCommand(command);
    setCommandNotice(`Command sent: ${JSON.stringify(command)}`);
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
    <main className="mx-auto min-h-screen w-full max-w-7xl p-4 sm:p-6">
      <HeaderBar lastUpdated={lastUpdated} pipelineConnected={pipelineConnected} onRefresh={refresh} />
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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <StatusCard summary={bundle.summary} />
        <TemperatureCard telemetry={bundle.telemetry} trend={bundle.trend} />
        <ControlsCard
          onSendCommand={handleSendCommand}
          onToggleSchedule={handleToggleSchedule}
          scheduleState={scheduleState}
        />
        <AnalyticsCard summary={bundle.summary} />
        <TemperatureTrendCard trend={bundle.trend} />
        <MlInsightsCard ml={bundle.ml} />
        <AiReportCard />
      </section>
    </main>
  );
}

export default App;

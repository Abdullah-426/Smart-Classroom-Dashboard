import { BarChart3, ExternalLink, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { CurrentOccupancySession, DashboardSummaryPayload, OccupancySessionDetail } from "../../types/dashboard";
import { Card } from "../ui/Card";
import { OccupancySessionsOverlay } from "./OccupancySessionsOverlay";

interface AnalyticsCardProps {
  summary: DashboardSummaryPayload;
  /** Total pipeline “off” time (persisted). */
  downtimeMs: number;
  onResetDowntime: () => void | Promise<void>;
  occupancyCurrentSession: CurrentOccupancySession | null;
  storedOccupancySessionKeys: string[];
  onRefresh: () => void | Promise<void>;
  className?: string;
}

function formatDowntime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function metricCard(label: string, value: string) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

export function AnalyticsCard({
  summary,
  downtimeMs,
  onResetDowntime,
  occupancyCurrentSession,
  storedOccupancySessionKeys,
  onRefresh,
  className,
}: AnalyticsCardProps) {
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(false);
  const [resettingDowntime, setResettingDowntime] = useState(false);

  async function handleResetDowntime() {
    if (!window.confirm("Reset the total pipeline downtime timer to zero?")) return;
    setResettingDowntime(true);
    try {
      await onResetDowntime();
    } finally {
      setResettingDowntime(false);
    }
  }

  const sessions: OccupancySessionDetail[] = summary.occupancySessionList ?? [];

  return (
    <Card
      title="Analytics"
      subtitle="Operational insights"
      icon={<BarChart3 size={18} />}
      className={className}
    >
      <div className="space-y-2">
        {metricCard("Estimated energy saved", summary.estimatedEnergySaved)}
        {metricCard("Occupancy timer", summary.occupancyTimer)}

        <button
          type="button"
          onClick={() => setSessionsPanelOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2 text-left text-sm transition hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700/50"
        >
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Occupancy sessions</p>
            <p className="mt-1 font-medium">{summary.occupancySessions}</p>
          </div>
          <ExternalLink className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
        </button>

        <div className="flex items-stretch gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Pipeline downtime (total)</p>
            <p className="mt-1 font-mono text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">
              {formatDowntime(downtimeMs)}
            </p>
          </div>
          <button
            type="button"
            title="Reset downtime timer"
            disabled={resettingDowntime}
            onClick={() => void handleResetDowntime()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw size={18} aria-hidden />
            <span className="sr-only">Reset downtime timer</span>
          </button>
        </div>

        {metricCard("High temp warning", summary.highTempWarning)}
      </div>

      <OccupancySessionsOverlay
        open={sessionsPanelOpen}
        onClose={() => setSessionsPanelOpen(false)}
        sessions={sessions}
        currentFromStorage={occupancyCurrentSession}
        summaryOccupied={summary.occupied}
        summaryOccupancyTimer={summary.occupancyTimer}
        storedSessionKeys={storedOccupancySessionKeys}
        onRefresh={onRefresh}
      />
    </Card>
  );
}

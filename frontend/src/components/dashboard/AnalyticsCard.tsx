import { BarChart3, ChevronDown } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import type { DashboardSummaryPayload, OccupancySessionDetail } from "../../types/dashboard";
import { Card } from "../ui/Card";
import { SessionDetailModal } from "./SessionDetailModal";

interface AnalyticsCardProps {
  summary: DashboardSummaryPayload;
}

function metricCard(label: string, value: string) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

export function AnalyticsCard({ summary }: AnalyticsCardProps) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [detailSession, setDetailSession] = useState<OccupancySessionDetail | null>(null);

  const sessions = summary.occupancySessionList ?? [];

  function sessionRowLabel(s: OccupancySessionDetail): string {
    if (s.legacy) return s.durationText || "Legacy session";
    return `Session ${s.sessionNumber}: ${s.durationText}`;
  }

  return (
    <Card title="Analytics" subtitle="Operational classroom insights" icon={<BarChart3 size={18} />}>
      <div className="space-y-2">
        {metricCard("Estimated energy saved", summary.estimatedEnergySaved)}
        {metricCard("Occupancy timer", summary.occupancyTimer)}

        <div className="rounded-xl border border-transparent bg-slate-100 transition dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSessionsOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-200/80 dark:hover:bg-slate-700/50"
            aria-expanded={sessionsOpen}
          >
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Occupancy sessions</p>
              <p className="mt-1 font-medium">{summary.occupancySessions}</p>
            </div>
            <ChevronDown
              className={clsx("h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400", sessionsOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          {sessionsOpen ? (
            <div className="border-t border-slate-200/80 px-2 pb-2 pt-1 dark:border-slate-600/80">
              {sessions.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">No completed sessions yet.</p>
              ) : (
                <ul className="max-h-44 divide-y divide-slate-200/90 overflow-y-auto rounded-lg dark:divide-slate-600/80">
                  {sessions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setDetailSession(s)}
                        className="w-full px-2 py-2 text-left text-xs text-slate-700 hover:bg-white/80 dark:text-slate-200 dark:hover:bg-slate-700/60"
                      >
                        {sessionRowLabel(s)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {metricCard("High temp warning", summary.highTempWarning)}
      </div>

      {detailSession ? <SessionDetailModal session={detailSession} onClose={() => setDetailSession(null)} /> : null}
    </Card>
  );
}

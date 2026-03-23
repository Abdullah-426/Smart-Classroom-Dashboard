import { Activity } from "lucide-react";
import type { DashboardSummaryPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface StatusCardProps {
  summary: DashboardSummaryPayload;
  className?: string;
}

function statusClass(occupied: boolean) {
  return occupied
    ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
    : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export function StatusCard({ summary, className }: StatusCardProps) {
  const lightOn = summary.light === 1;
  const fanOn = summary.fan === 1;

  return (
    <Card
      title="Live Classroom Status"
      subtitle="Room occupancy and control mode"
      icon={<Activity size={18} />}
      className={className}
    >
      <div className="space-y-3">
        <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClass(summary.occupied)}`}>
          {summary.roomStatus}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-slate-500 dark:text-slate-400">Light</p>
            <p className={`mt-1 font-medium ${lightOn ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"}`}>
              {lightOn ? "ON" : "OFF"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-slate-500 dark:text-slate-400">Fan</p>
            <p className={`mt-1 font-medium ${fanOn ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"}`}>
              {fanOn ? "ON" : "OFF"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-slate-500 dark:text-slate-400">Mode</p>
            <p className="mt-1 font-medium uppercase">{summary.mode}</p>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <p className="text-slate-500 dark:text-slate-400">Scheduled hours</p>
            <p className="mt-1 font-medium">{summary.collegeHours}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

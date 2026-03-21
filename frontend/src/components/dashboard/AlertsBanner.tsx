import { AlertTriangle, BellRing } from "lucide-react";

interface AlertsBannerProps {
  alerts: string[];
}

export function AlertsBanner({ alerts }: AlertsBannerProps) {
  if (!alerts.length) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-900/20 dark:text-emerald-300">
        <BellRing size={16} />
        No active alerts. Systems operating normally.
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/70 dark:bg-amber-900/20">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
        <AlertTriangle size={16} />
        Active Alerts
      </div>
      <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-200">
        {alerts.map((alert) => (
          <li key={alert}>- {alert}</li>
        ))}
      </ul>
    </div>
  );
}

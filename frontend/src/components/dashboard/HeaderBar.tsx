import { Cpu, RefreshCcw } from "lucide-react";
import { ThemeToggle } from "../ui/ThemeToggle";

interface HeaderBarProps {
  lastUpdated: string;
  /** null = still loading first poll; true/false from Wokwi→MQTT freshness on Node-RED */
  pipelineConnected: boolean | null;
  onRefresh: () => void;
}

function pipelineTitle(connected: boolean | null): string {
  if (connected === null) return "Checking Wokwi → MQTT → Node-RED link…";
  if (connected) return "Live: Wokwi → MQTT → Node-RED → dashboard";
  return "No recent device telemetry (check Wokwi / MQTT / Node-RED)";
}

export function HeaderBar({ lastUpdated, pipelineConnected, onRefresh }: HeaderBarProps) {
  return (
    <header className="glass-panel mb-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-sky-500/10 p-2 text-sky-500">
          <Cpu size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Smart Classroom Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Node-RED powered monitoring and control surface
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Updated {lastUpdated}</span>
        <div
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
          title={pipelineTitle(pipelineConnected)}
          role="status"
          aria-label={pipelineTitle(pipelineConnected)}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full border-2 transition-colors ${
              pipelineConnected === true
                ? "border-emerald-600 bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.65)]"
                : pipelineConnected === false
                  ? "border-rose-500 bg-rose-500/90"
                  : "border-slate-400 bg-transparent dark:border-slate-500"
            }`}
          />
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCcw size={13} />
          Refresh
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

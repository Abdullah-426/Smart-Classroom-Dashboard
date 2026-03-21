import { Cpu, RefreshCcw } from "lucide-react";
import { ThemeToggle } from "../ui/ThemeToggle";

interface HeaderBarProps {
  lastUpdated: string;
  onRefresh: () => void;
}

export function HeaderBar({ lastUpdated, onRefresh }: HeaderBarProps) {
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
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Updated {lastUpdated}</span>
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

import type { ReactNode } from "react";
import { Home, ScanLine } from "lucide-react";
import clsx from "clsx";

export type AppRouteId = "home" | "attendance";

interface SideNavProps {
  route: AppRouteId;
  onNavigate: (r: AppRouteId) => void;
  className?: string;
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition",
        active
          ? "bg-sky-500/15 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300"
          : "bg-transparent text-slate-700 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-white/5 dark:hover:text-white",
      )}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={clsx(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border transition",
          active
            ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-500/35 dark:bg-sky-500/20 dark:text-sky-300"
            : "border-slate-200/70 bg-white/40 text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-slate-200",
        )}
      >
        {icon}
      </span>
      <span className="font-semibold">{label}</span>
    </button>
  );
}

export function SideNav({ route, onNavigate, className }: SideNavProps) {
  return (
    <aside className={`glass-panel w-72 p-3 ${className ?? ""}`}>
      <div className="px-2 pb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Navigation
        </p>
      </div>
      <nav className="space-y-2">
        <NavItem
          active={route === "home"}
          icon={<Home size={18} />}
          label="Home"
          onClick={() => onNavigate("home")}
        />
        <NavItem
          active={route === "attendance"}
          icon={<ScanLine size={18} />}
          label="Attendance Tracker"
          onClick={() => onNavigate("attendance")}
        />
      </nav>
    </aside>
  );
}


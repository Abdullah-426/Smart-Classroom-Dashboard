import type { ReactNode } from "react";
import clsx from "clsx";

interface CardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ title, subtitle, icon, className, children }: CardProps) {
  return (
    <section className={clsx("glass-panel", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        {icon ? <div className="text-sky-500 dark:text-sky-400">{icon}</div> : null}
      </header>
      {children}
    </section>
  );
}

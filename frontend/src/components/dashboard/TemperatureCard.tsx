import { Thermometer } from "lucide-react";
import type { TelemetryPayload, TrendPoint } from "../../types/dashboard";
import { Card } from "../ui/Card";
import { SemicircleTemperatureGauge } from "./SemicircleTemperatureGauge";

interface TemperatureCardProps {
  telemetry: TelemetryPayload;
  trend: TrendPoint[];
}

export function TemperatureCard({ telemetry, trend }: TemperatureCardProps) {
  const t = telemetry.temperature;
  const valid = Number.isFinite(t) && t > -900;
  const threshold = telemetry.tempThreshold;
  const delta = valid ? t - threshold : null;

  let deltaLabel: string | null = null;
  if (delta !== null) {
    const abs = Math.abs(delta);
    if (delta < 0) deltaLabel = `${abs.toFixed(1)} °C below target`;
    else if (delta > 0) deltaLabel = `${abs.toFixed(1)} °C above target`;
    else deltaLabel = "At target";
  }

  const recent = trend.filter((p) => Number.isFinite(p.temperature));
  const recentTemps = recent.map((p) => p.temperature);
  const recentMin = recentTemps.length ? Math.min(...recentTemps) : null;
  const recentMax = recentTemps.length ? Math.max(...recentTemps) : null;

  return (
    <Card title="Temperature" subtitle="Current classroom temperature" icon={<Thermometer size={18} />}>
      <div className="flex flex-col gap-4">
        <SemicircleTemperatureGauge temperature={telemetry.temperature} />

        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-slate-100/90 px-3 py-2.5 text-center dark:bg-slate-800/70">
            <p className="text-xs text-slate-500 dark:text-slate-400">Target threshold</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-sky-600 dark:text-sky-400">
              {threshold.toFixed(1)} °C
            </p>
            {deltaLabel ? (
              <p
                className={`mt-1 text-xs font-medium ${
                  delta === null
                    ? ""
                    : delta > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : delta < 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {deltaLabel}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-slate-200/80 bg-white/60 px-2 py-2 dark:border-slate-700/80 dark:bg-slate-900/40">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recent min
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {recentMin !== null ? `${recentMin.toFixed(1)} °C` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/60 px-2 py-2 dark:border-slate-700/80 dark:bg-slate-900/40">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recent max
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {recentMax !== null ? `${recentMax.toFixed(1)} °C` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

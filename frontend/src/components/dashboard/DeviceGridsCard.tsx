import { Cpu } from "lucide-react";
import type { TelemetryPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

function Led({
  on,
  kind,
}: {
  on: boolean;
  kind: "white" | "cyan";
}) {
  const base =
    "inline-flex h-6 w-6 items-center justify-center rounded-md border transition";
  if (kind === "white") {
    return (
      <span
        className={
          on
            ? `${base} border-slate-200 bg-white shadow-[0_0_14px_rgba(255,255,255,0.55)]`
            : `${base} border-slate-700/60 bg-slate-800/40`
        }
      />
    );
  }
  return (
    <span
      className={
        on
          ? `${base} border-cyan-400/50 bg-cyan-300/20 shadow-[0_0_14px_rgba(34,211,238,0.35)]`
          : `${base} border-slate-700/60 bg-slate-800/40`
      }
    />
  );
}

export function DeviceGridsCard({ telemetry }: { telemetry: TelemetryPayload }) {
  const lightsMask = typeof telemetry.lightsMask === "number" ? telemetry.lightsMask : 0;
  const fansMask = typeof telemetry.fansMask === "number" ? telemetry.fansMask : 0;
  const lightOnCount = telemetry.lightOnCount ?? (telemetry.light ? 10 : 0);
  const fanOnCount = telemetry.fanOnCount ?? (telemetry.fan ? 6 : 0);

  return (
    <Card
      title="Classroom Devices"
      subtitle="10 lights (2x5), 6 fans (2x3) and their current control state"
      icon={<Cpu size={18} />}
      className="lg:col-span-2 lg:h-full"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Lights
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {lightOnCount}/10 ON
            </p>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }).map((_, i) => {
              const on = ((lightsMask >> i) & 1) === 1;
              return <Led key={i} on={on} kind="white" />;
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Fans
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {fanOnCount}/6 ON
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => {
              const on = ((fansMask >> i) & 1) === 1;
              return <Led key={i} on={on} kind="cyan" />;
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}


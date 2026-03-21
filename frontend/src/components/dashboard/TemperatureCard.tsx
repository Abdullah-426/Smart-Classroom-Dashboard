import { Thermometer } from "lucide-react";
import type { TelemetryPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface TemperatureCardProps {
  telemetry: TelemetryPayload;
}

export function TemperatureCard({ telemetry }: TemperatureCardProps) {
  return (
    <Card title="Temperature" subtitle="Current classroom temperature" icon={<Thermometer size={18} />}>
      <div className="flex items-end gap-1">
        <span className="text-4xl font-bold text-slate-900 dark:text-slate-100">
          {telemetry.temperature.toFixed(1)}
        </span>
        <span className="pb-1 text-sm text-slate-500 dark:text-slate-400">deg C</span>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Threshold target: {telemetry.tempThreshold.toFixed(1)} deg C
      </p>
    </Card>
  );
}

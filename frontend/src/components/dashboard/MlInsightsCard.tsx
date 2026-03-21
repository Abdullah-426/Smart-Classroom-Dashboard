import { BrainCircuit } from "lucide-react";
import type { MlPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface MlInsightsCardProps {
  ml: MlPayload;
}

export function MlInsightsCard({ ml }: MlInsightsCardProps) {
  const trend = ml.slopePerMin > 0 ? "Rising" : ml.slopePerMin < 0 ? "Falling" : "Stable";

  return (
    <Card title="ML Insights" subtitle="Predictive temperature intelligence" icon={<BrainCircuit size={18} />}>
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="2-min forecast" value={`${ml.predictedTemp.toFixed(1)} deg C`} />
          <Metric label="Trend" value={trend} />
          <Metric label="Confidence" value={`${Math.round(ml.confidence * 100)}%`} />
          <Metric label="MAE" value={ml.mae === null ? "N/A" : ml.mae.toFixed(2)} />
          <Metric label="Status" value={ml.statusText} />
          <Metric label="Anomaly" value={ml.anomaly ? "Detected" : "None"} />
        </div>
        <div className="pt-1">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
              ml.anomaly
                ? "border-rose-400 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                : "border-emerald-400 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            }`}
          >
            {ml.anomaly ? "Anomaly" : "Normal"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

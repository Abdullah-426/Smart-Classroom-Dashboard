import { BarChart3 } from "lucide-react";
import type { DashboardSummaryPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface AnalyticsCardProps {
  summary: DashboardSummaryPayload;
}

export function AnalyticsCard({ summary }: AnalyticsCardProps) {
  const items = [
    { label: "Estimated energy saved", value: summary.estimatedEnergySaved },
    { label: "Occupancy timer", value: summary.occupancyTimer },
    { label: "Occupancy sessions", value: String(summary.occupancySessions) },
    { label: "High temp warning", value: summary.highTempWarning },
  ];

  return (
    <Card title="Analytics" subtitle="Operational classroom insights" icon={<BarChart3 size={18} />}>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="mt-1 font-medium">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

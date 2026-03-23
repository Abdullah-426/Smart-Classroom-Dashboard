import { LineChart } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, AreaChart, Area } from "recharts";
import { TREND_RANGE_OPTIONS, trendRangeLongScale, type TrendRangeId } from "../../constants/temperatureTrend";
import type { TrendPoint } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface TemperatureTrendCardProps {
  trend: TrendPoint[];
  rangeId: TrendRangeId;
  onRangeChange: (id: TrendRangeId) => void;
  className?: string;
}

/** Recharts needs strictly increasing numeric X; duplicate `time` strings caused hairline gaps. */
function chartDataWithMonotonicX(pts: TrendPoint[]): TrendPoint[] {
  let lastAt = -Infinity;
  return pts.map((p) => {
    let atMs = p.atMs;
    if (typeof atMs !== "number" || !Number.isFinite(atMs)) {
      atMs = lastAt > 0 ? lastAt + 1000 : Date.now();
    }
    if (atMs <= lastAt) atMs = lastAt + 1;
    lastAt = atMs;
    return { ...p, atMs };
  });
}

export function TemperatureTrendCard({ trend, rangeId, onRangeChange, className }: TemperatureTrendCardProps) {
  const data = useMemo(() => chartDataWithMonotonicX(trend), [trend]);
  const longScale = trendRangeLongScale(rangeId);

  return (
    <Card
      title="Temperature Trend"
      subtitle="Storage-backed window + live edge; gaps when samples are missing or more than 20s apart"
      icon={<LineChart size={18} />}
      className={`lg:col-span-2 ${className ?? ""}`}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TREND_RANGE_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onRangeChange(o.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              rangeId === o.id
                ? "bg-sky-600 text-white dark:bg-sky-500"
                : "bg-slate-200/90 text-slate-700 hover:bg-slate-300/90 dark:bg-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-600/80"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#33415544" />
            <XAxis
              dataKey="atMs"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tick={{ fontSize: 11 }}
              tickMargin={8}
              tickFormatter={(v) => {
                if (typeof v !== "number" || !Number.isFinite(v)) return "";
                const d = new Date(v);
                return longScale
                  ? d.toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : d.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
              }}
            />
            <YAxis tick={{ fontSize: 11 }} width={30} />
            <Tooltip
              formatter={(value) =>
                value != null && typeof value === "number" && Number.isFinite(value)
                  ? `${value}°C`
                  : "—"
              }
              labelFormatter={(_, payload) => {
                const row = Array.isArray(payload) ? (payload[0]?.payload as TrendPoint | undefined) : undefined;
                return row?.time ?? "";
              }}
            />
            <Area
              type="monotone"
              dataKey="temperature"
              stroke="#38bdf8"
              fill="url(#tempFill)"
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

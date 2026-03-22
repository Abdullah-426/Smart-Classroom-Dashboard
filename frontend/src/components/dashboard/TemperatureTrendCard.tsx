import { LineChart } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, AreaChart, Area } from "recharts";
import type { TrendPoint } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface TemperatureTrendCardProps {
  trend: TrendPoint[];
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

export function TemperatureTrendCard({ trend }: TemperatureTrendCardProps) {
  const data = useMemo(() => chartDataWithMonotonicX(trend), [trend]);

  return (
    <Card
      title="Temperature Trend"
      subtitle="~1s poll + file history; chart gaps only after ~22s MQTT silence (wider than status dot)"
      icon={<LineChart size={18} />}
      className="lg:col-span-2"
    >
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
              tickFormatter={(v) =>
                typeof v === "number" && Number.isFinite(v)
                  ? new Date(v).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : ""
              }
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

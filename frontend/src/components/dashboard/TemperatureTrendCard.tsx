import { LineChart } from "lucide-react";
import {
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AreaChart,
  Area,
} from "recharts";
import type { TrendPoint } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface TemperatureTrendCardProps {
  trend: TrendPoint[];
}

export function TemperatureTrendCard({ trend }: TemperatureTrendCardProps) {
  return (
    <Card
      title="Temperature Trend"
      subtitle="Live 2.5s polling + local file history (storage bridge)"
      icon={<LineChart size={18} />}
      className="lg:col-span-2"
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#33415544" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} tickMargin={8} />
            <YAxis tick={{ fontSize: 11 }} width={30} />
            <Tooltip />
            <Area type="monotone" dataKey="temperature" stroke="#38bdf8" fill="url(#tempFill)" />
            <Line type="monotone" dataKey="temperature" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

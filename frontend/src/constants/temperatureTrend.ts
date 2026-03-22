export type TrendRangeId = "1m" | "5m" | "10m" | "1h" | "1d" | "1w" | "1mo";

export const TREND_RANGE_OPTIONS: {
  id: TrendRangeId;
  label: string;
  ms: number;
  /** Use date+time on X axis ticks */
  longScale: boolean;
}[] = [
  { id: "1m", label: "1 min", ms: 60_000, longScale: false },
  { id: "5m", label: "5 min", ms: 5 * 60_000, longScale: false },
  { id: "10m", label: "10 min", ms: 10 * 60_000, longScale: false },
  { id: "1h", label: "1 hr", ms: 3_600_000, longScale: false },
  { id: "1d", label: "1 day", ms: 86_400_000, longScale: true },
  { id: "1w", label: "1 week", ms: 7 * 86_400_000, longScale: true },
  { id: "1mo", label: "1 month", ms: 30 * 86_400_000, longScale: true },
];

export function trendRangeMs(id: TrendRangeId): number {
  const o = TREND_RANGE_OPTIONS.find((x) => x.id === id);
  return o?.ms ?? 3_600_000;
}

export function trendRangeLongScale(id: TrendRangeId): boolean {
  return TREND_RANGE_OPTIONS.find((x) => x.id === id)?.longScale ?? false;
}

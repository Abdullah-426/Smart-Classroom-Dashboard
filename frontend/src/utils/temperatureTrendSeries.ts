import type { TrendPoint } from "../types/dashboard";

/** If two stored samples are farther apart than this, insert a null point so the line breaks (no interpolation across gaps). */
export const TREND_GAP_BREAK_MS = 20_000;

export function normalizeTrendPointsMonotonic(pts: TrendPoint[]): TrendPoint[] {
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

function timeLabel(atMs: number): string {
  return new Date(atMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function insertGapNulls(points: TrendPoint[]): TrendPoint[] {
  if (points.length < 2) return points;
  const sorted = [...points].sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));
  const out: TrendPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0) {
      const prevMs = sorted[i - 1].atMs ?? 0;
      const curMs = sorted[i].atMs ?? 0;
      if (curMs - prevMs > TREND_GAP_BREAK_MS) {
        out.push({
          time: timeLabel(curMs - 1),
          atMs: curMs - 1,
          temperature: null,
        });
      }
    }
    out.push(sorted[i]);
  }
  return out;
}

/**
 * Historic points from storage (window) + current poll edge. No line across large gaps; live edge uses real °C or null.
 */
export function mergeHistoricWithLive(
  historic: TrendPoint[],
  opts: {
    serverTimeMs: number | undefined;
    temperature: number;
    lineLive: boolean;
    sinceMs: number;
  },
): TrendPoint[] {
  const serverNow =
    typeof opts.serverTimeMs === "number" && Number.isFinite(opts.serverTimeMs)
      ? opts.serverTimeMs
      : Date.now();
  const liveTemp = opts.lineLive ? opts.temperature : null;
  const filtered = historic.filter(
    (p) => typeof p.atMs === "number" && p.atMs >= opts.sinceMs && p.atMs <= serverNow + 120_000,
  );
  let pts = normalizeTrendPointsMonotonic(filtered);
  pts = insertGapNulls(pts);
  pts = normalizeTrendPointsMonotonic(pts);
  const last = pts[pts.length - 1];
  if (last && typeof last.atMs === "number" && Math.abs(last.atMs - serverNow) < 900) {
    const copy = pts.slice(0, -1);
    copy.push({
      atMs: serverNow,
      time: timeLabel(serverNow),
      temperature: liveTemp,
    });
    return normalizeTrendPointsMonotonic(copy);
  }
  return normalizeTrendPointsMonotonic([
    ...pts,
    { atMs: serverNow, time: timeLabel(serverNow), temperature: liveTemp },
  ]);
}

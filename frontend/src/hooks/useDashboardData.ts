import { useCallback, useEffect, useMemo, useState } from "react";
import { dashboardApi } from "../services/api";
import type { DashboardBundle, DashboardSummaryPayload, MlPayload, TelemetryPayload, TrendPoint } from "../types/dashboard";

const POLL_MS = 2500;
const MAX_TREND_POINTS = 25;

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeTelemetry(input: TelemetryPayload): TelemetryPayload {
  return {
    temperature: asNumber(input?.temperature, 0),
    motion: Boolean(input?.motion),
    occupied: Boolean(input?.occupied),
    light: input?.light === 1 ? 1 : 0,
    fan: input?.fan === 1 ? 1 : 0,
    mode: input?.mode === "manual" ? "manual" : "auto",
    forceOff: Boolean(input?.forceOff),
    afterHoursAlert: Boolean(input?.afterHoursAlert),
    tempThreshold: asNumber(input?.tempThreshold, 28),
  };
}

function normalizeSummary(input: DashboardSummaryPayload): DashboardSummaryPayload {
  return {
    roomStatus: input?.roomStatus ?? "Unknown",
    light: input?.light === 1 ? 1 : 0,
    fan: input?.fan === 1 ? 1 : 0,
    mode: input?.mode === "manual" ? "manual" : "auto",
    collegeHours: input?.collegeHours ?? "Unknown",
    alerts: Array.isArray(input?.alerts) ? input.alerts.filter(Boolean) : [],
    temperature: asNumber(input?.temperature, 0),
    occupied: Boolean(input?.occupied),
    afterHoursAlert: Boolean(input?.afterHoursAlert),
    tempThreshold: asNumber(input?.tempThreshold, 28),
    occupancyTimer: input?.occupancyTimer ?? "0 min 0 sec",
    occupancySessions: asNumber(input?.occupancySessions, 0),
    estimatedEnergySaved: input?.estimatedEnergySaved ?? "0.00 Wh",
    highTempWarning: input?.highTempWarning ?? "No critical temperature alert",
  };
}

function normalizeMl(input: MlPayload): MlPayload {
  return {
    predictedTemp: asNumber(input?.predictedTemp, 0),
    slopePerMin: asNumber(input?.slopePerMin, 0),
    confidence: asNumber(input?.confidence, 0),
    mae: typeof input?.mae === "number" ? input.mae : null,
    anomaly: Boolean(input?.anomaly),
    assist: Boolean(input?.assist),
    statusText: input?.statusText ?? "Monitoring",
  };
}

function buildTrend(prev: TrendPoint[], temperature: number): TrendPoint[] {
  const now = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const next = [...prev, { time: now, temperature }];
  return next.slice(-MAX_TREND_POINTS);
}

export function useDashboardData() {
  const [bundle, setBundle] = useState<DashboardBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("-");

  const load = useCallback(async () => {
    try {
      const [telemetry, summary, ml] = await Promise.all([
        dashboardApi.getTelemetry(),
        dashboardApi.getSummary(),
        dashboardApi.getMl(),
      ]);
      const safeTelemetry = normalizeTelemetry(telemetry);
      const safeSummary = normalizeSummary(summary);
      const safeMl = normalizeMl(ml);

      setBundle((current) => ({
        telemetry: safeTelemetry,
        summary: safeSummary,
        ml: safeMl,
        trend: buildTrend(current?.trend ?? [], safeTelemetry.temperature),
      }));
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const alerts = useMemo(() => {
    if (!bundle) return [];
    const summaryAlerts = Array.isArray(bundle.summary.alerts) ? bundle.summary.alerts : [];
    const values = [...summaryAlerts];
    if (
      bundle.summary.highTempWarning &&
      bundle.summary.highTempWarning !== "No high temperature warning" &&
      bundle.summary.highTempWarning !== "No critical temperature alert"
    ) {
      values.push(bundle.summary.highTempWarning);
    }
    return values;
  }, [bundle]);

  return {
    bundle,
    loading,
    error,
    lastUpdated,
    alerts,
    refresh: load,
  };
}

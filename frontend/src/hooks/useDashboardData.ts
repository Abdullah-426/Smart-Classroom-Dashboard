import { useCallback, useEffect, useMemo, useState } from "react";
import { dashboardApi } from "../services/api";
import type {
  DashboardBundle,
  DashboardSummaryPayload,
  MlPayload,
  OccupancySessionDetail,
  ScheduleStateResponse,
  ScheduleToggleResponse,
  TelemetryPayload,
  TrendPoint,
} from "../types/dashboard";

const POLL_MS = 2500;
const MAX_TREND_POINTS = 25;
/** Max age of last Wokwi→MQTT message on Node-RED clock to count as “live” (~5× typical sim interval). */
const PIPELINE_MAX_AGE_MS = 12_000;

function isPipelineLive(t: TelemetryPayload): boolean {
  const serverNow = t.serverTimeMs;
  const last = t.lastWokwiMqttMs;
  if (typeof serverNow !== "number" || typeof last !== "number" || last <= 0) return false;
  const age = serverNow - last;
  return age >= 0 && age <= PIPELINE_MAX_AGE_MS;
}

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
    serverTimeMs: typeof input?.serverTimeMs === "number" ? input.serverTimeMs : undefined,
    lastWokwiMqttMs: typeof input?.lastWokwiMqttMs === "number" ? input.lastWokwiMqttMs : undefined,
  };
}

function normalizeOccupancySessionList(raw: unknown): OccupancySessionDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item): OccupancySessionDetail => {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      return {
        sessionNumber: typeof o.sessionNumber === "number" ? o.sessionNumber : null,
        durationText: String(o.durationText ?? ""),
        durationMinutes: typeof o.durationMinutes === "number" ? o.durationMinutes : undefined,
        durationSeconds: typeof o.durationSeconds === "number" ? o.durationSeconds : undefined,
        startedAtIso: typeof o.startedAtIso === "string" ? o.startedAtIso : null,
        endedAtIso: typeof o.endedAtIso === "string" ? o.endedAtIso : null,
        legacy: Boolean(o.legacy),
      };
    }
    return {
      sessionNumber: null,
      durationText: String(item),
      startedAtIso: null,
      endedAtIso: null,
      legacy: true,
    };
  });
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
    occupancySessionList: normalizeOccupancySessionList(input?.occupancySessionList),
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
  const [scheduleState, setScheduleState] = useState<ScheduleStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Dashboard clock for the header ("Updated …"). Set in `load()` after a successful poll.
   * Controls no longer shows time — this is the single client-side clock source for the UI.
   */
  const [lastUpdated, setLastUpdated] = useState<string>("-");
  const [pipelineConnected, setPipelineConnected] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const [telemetry, summary, ml, sched] = await Promise.all([
        dashboardApi.getTelemetry(),
        dashboardApi.getSummary(),
        dashboardApi.getMl(),
        dashboardApi.getScheduleState(),
      ]);
      const safeTelemetry = normalizeTelemetry(telemetry);
      const safeSummary = normalizeSummary(summary);
      const safeMl = normalizeMl(ml);

      setScheduleState(sched);
      setPipelineConnected(isPipelineLive(safeTelemetry));
      setBundle((current) => ({
        telemetry: safeTelemetry,
        summary: safeSummary,
        ml: safeMl,
        trend: buildTrend(current?.trend ?? [], safeTelemetry.temperature),
      }));
      setError(null);
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setPipelineConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Merge toggle API response so UI updates immediately without waiting for full refresh. */
  const applyScheduleAfterToggle = useCallback((r: ScheduleToggleResponse) => {
    setScheduleState({
      ok: r.ok,
      scheduleEnabled: r.scheduleEnabled,
      inScheduleWindow: r.inScheduleWindow,
      serverTimeIso: r.serverTimeIso,
      serverLocalTime: r.serverLocalTime,
      scheduleWindowLabel: r.scheduleWindowLabel,
    });
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
    scheduleState,
    applyScheduleAfterToggle,
    loading,
    error,
    lastUpdated,
    pipelineConnected,
    alerts,
    refresh: load,
  };
}

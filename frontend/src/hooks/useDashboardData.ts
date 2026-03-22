import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dashboardApi } from "../services/api";
import { storageApi, type StorageInfoResponse } from "../services/storageApi";
import { mergeOccupancySessionLists } from "../utils/mergeOccupancySessions";
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
/** Live chart + persisted tail (storage-bridge). */
const MAX_TREND_POINTS = 200;
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
  const bundleRef = useRef<DashboardBundle | null>(null);
  const trendResetRef = useRef(false);
  const [scheduleState, setScheduleState] = useState<ScheduleStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfoResponse | null>(null);
  /**
   * Dashboard clock for the header ("Updated …"). Set in `load()` after a successful poll.
   * Controls no longer shows time — this is the single client-side clock source for the UI.
   */
  const [lastUpdated, setLastUpdated] = useState<string>("-");
  const [pipelineConnected, setPipelineConnected] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const needTrendSeed = trendResetRef.current || !bundleRef.current?.trend?.length;
      let trendSeed: TrendPoint[] = [];
      if (needTrendSeed) {
        trendSeed = await storageApi.getTrendPoints(MAX_TREND_POINTS).catch(() => []);
      }

      const [telemetry, summary, ml, sched, sInfo, storedOcc] = await Promise.all([
        dashboardApi.getTelemetry(),
        dashboardApi.getSummary(),
        dashboardApi.getMl(),
        dashboardApi.getScheduleState(),
        storageApi.getInfo(),
        storageApi.getOccupancySessions().catch(() => []),
      ]);
      const safeTelemetry = normalizeTelemetry(telemetry);
      const liveOcc = normalizeOccupancySessionList(summary.occupancySessionList);
      const mergedOcc = mergeOccupancySessionLists(storedOcc, liveOcc);
      const safeSummary = {
        ...normalizeSummary(summary),
        occupancySessionList: mergedOcc,
        occupancySessions: mergedOcc.length,
      };
      const safeMl = normalizeMl(ml);

      setScheduleState(sched);
      setStorageInfo(sInfo);
      setPipelineConnected(isPipelineLive(safeTelemetry));
      setBundle((current) => {
        let baseTrend = current?.trend ?? [];
        if (trendResetRef.current) {
          trendResetRef.current = false;
          baseTrend = trendSeed.length ? trendSeed : [];
        } else if (!baseTrend.length && trendSeed.length) {
          baseTrend = trendSeed;
        }
        const next: DashboardBundle = {
          telemetry: safeTelemetry,
          summary: safeSummary,
          ml: safeMl,
          trend: buildTrend(baseTrend, safeTelemetry.temperature),
        };
        bundleRef.current = next;
        return next;
      });
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

  const clearPersistedStorage = useCallback(async () => {
    try {
      await storageApi.clear();
    } catch {
      /* Bridge may be stopped; still reset in-memory trend on next load */
    }
    trendResetRef.current = true;
    await load();
  }, [load]);

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
    storageInfo,
    clearPersistedStorage,
    alerts,
    refresh: load,
  };
}

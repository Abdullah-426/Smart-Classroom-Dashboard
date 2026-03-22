import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dashboardApi } from "../services/api";
import { storageApi, type StorageInfoResponse } from "../services/storageApi";
import { mergeOccupancySessionLists, occupancySessionKey } from "../utils/mergeOccupancySessions";
import type {
  CurrentOccupancySession,
  DashboardBundle,
  DashboardSummaryPayload,
  MlPayload,
  OccupancySessionDetail,
  ScheduleStateResponse,
  ScheduleToggleResponse,
  TelemetryPayload,
  TrendPoint,
} from "../types/dashboard";
import {
  CHART_LINE_DEAD_MIN_AGE_MS,
  CHART_LINE_LIVE_MAX_AGE_MS,
  DASHBOARD_POLL_MS,
  PIPELINE_DEAD_MIN_AGE_MS,
  PIPELINE_LIVE_MAX_AGE_MS,
} from "../constants/pipeline";
/** Live chart + persisted tail (storage-bridge). */
const MAX_TREND_POINTS = 200;

/** Milliseconds since last MQTT (Node-RED clock); `null` if unknown. */
function telemetryAgeMs(t: TelemetryPayload): number | null {
  const serverNow = t.serverTimeMs;
  const last = t.lastWokwiMqttMs;
  if (typeof serverNow !== "number" || typeof last !== "number" || last <= 0 || !Number.isFinite(last)) {
    return null;
  }
  let age = serverNow - last;
  if (age < 0 && age > -120_000) age = 0;
  if (age < 0) return null;
  return age;
}

/** Schmitt-style: no flicker in the (LIVE_MAX, DEAD_MIN] band. */
function nextPipelineStable(age: number | null, prevStable: boolean): boolean {
  if (age === null) return false;
  if (age <= PIPELINE_LIVE_MAX_AGE_MS) return true;
  if (age > PIPELINE_DEAD_MIN_AGE_MS) return false;
  return prevStable;
}

/**
 * Chart-only Schmitt: ignore single-poll spikes in MQTT age and missing timestamps.
 * `age === null` → hold previous (avoids hairline gaps when `lastWokwiMqttMs` blips).
 */
function nextChartLineLive(age: number | null, prev: boolean): boolean {
  if (age === null) return prev;
  if (age <= CHART_LINE_LIVE_MAX_AGE_MS) return true;
  if (age >= CHART_LINE_DEAD_MIN_AGE_MS) return false;
  return prev;
}

/** Ensure strictly increasing `atMs` for Recharts (history + live, multi-clock safe). */
function normalizeTrendAtMs(pts: TrendPoint[]): TrendPoint[] {
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
    lastWokwiMqttMs:
      typeof input?.lastWokwiMqttMs === "number" && Number.isFinite(input.lastWokwiMqttMs)
        ? input.lastWokwiMqttMs
        : input?.lastWokwiMqttMs === null
          ? null
          : undefined,
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
        flagged: Boolean(o.flagged),
      };
    }
    return {
      sessionNumber: null,
      durationText: String(item),
      startedAtIso: null,
      endedAtIso: null,
      legacy: true,
      flagged: false,
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

/**
 * Append a point; use `temperature: null` when chart Schmitt says “dead”.
 * `atMs` uses server clock when available so live points align with file history.
 */
function appendTrendPoint(
  prev: TrendPoint[],
  temperature: number,
  pipelineLive: boolean,
  serverTimeMs: number | undefined,
): TrendPoint[] {
  const atBase =
    typeof serverTimeMs === "number" && Number.isFinite(serverTimeMs) ? serverTimeMs : Date.now();
  const lastAt = prev.length ? prev[prev.length - 1].atMs : undefined;
  let atMs = atBase;
  if (typeof lastAt === "number" && atMs <= lastAt) atMs = lastAt + 1;

  const time = new Date(atMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const point: TrendPoint = pipelineLive
    ? { time, atMs, temperature }
    : { time, atMs, temperature: null };
  return [...prev, point].slice(-MAX_TREND_POINTS);
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
  /** Session keys present in `occupancy-sessions.json` (flag PATCH only works for these). */
  const [storedOccupancySessionKeys, setStoredOccupancySessionKeys] = useState<string[]>([]);
  const [occupancyCurrentSession, setOccupancyCurrentSession] = useState<CurrentOccupancySession | null>(null);
  /** Hysteresis for green/red + chart (must survive across polls). */
  const pipelineStableRef = useRef(true);
  /** Wider Schmitt so the trend chart does not flicker on brief MQTT jitter. */
  const chartLineLiveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const needTrendSeed = trendResetRef.current || !bundleRef.current?.trend?.length;
      let trendSeed: TrendPoint[] = [];
      if (needTrendSeed) {
        const raw = await storageApi.getTrendPoints(MAX_TREND_POINTS).catch(() => []);
        trendSeed = normalizeTrendAtMs(raw);
      }

      const [telemetry, summary, ml, sched, sInfo, occPayload] = await Promise.all([
        dashboardApi.getTelemetry(),
        dashboardApi.getSummary(),
        dashboardApi.getMl(),
        dashboardApi.getScheduleState(),
        storageApi.getInfo(),
        storageApi.getOccupancySessions(),
      ]);
      const storedOcc = occPayload.sessions;
      setOccupancyCurrentSession(occPayload.currentSession);
      const storedKeys = new Set(storedOcc.map((s) => occupancySessionKey(s)));
      setStoredOccupancySessionKeys([...storedKeys]);
      const safeTelemetry = normalizeTelemetry(telemetry);
      const liveOcc = normalizeOccupancySessionList(summary.occupancySessionList);
      const mergedOcc = mergeOccupancySessionLists(storedOcc, liveOcc);
      /** Only list sessions persisted in `occupancy-sessions.json`. Node-RED-only copies differ slightly (duration/timestamps) and duplicate rows; they cannot be flagged. */
      const displayOcc = mergedOcc.filter((s) => storedKeys.has(occupancySessionKey(s)));
      const safeSummary = {
        ...normalizeSummary(summary),
        occupancySessionList: displayOcc,
        occupancySessions: displayOcc.length,
      };
      const safeMl = normalizeMl(ml);

      setScheduleState(sched);
      setStorageInfo(sInfo);
      const age = telemetryAgeMs(safeTelemetry);
      const stable = nextPipelineStable(age, pipelineStableRef.current);
      pipelineStableRef.current = stable;
      setPipelineConnected(stable);
      const lineLive = nextChartLineLive(age, chartLineLiveRef.current);
      chartLineLiveRef.current = lineLive;
      setBundle((current) => {
        let baseTrend = current?.trend ?? [];
        if (trendResetRef.current) {
          trendResetRef.current = false;
          baseTrend = trendSeed.length ? trendSeed : [];
        } else if (!baseTrend.length && trendSeed.length) {
          baseTrend = trendSeed;
        }
        baseTrend = normalizeTrendAtMs(baseTrend);
        const next: DashboardBundle = {
          telemetry: safeTelemetry,
          summary: safeSummary,
          ml: safeMl,
          trend: appendTrendPoint(
            baseTrend,
            safeTelemetry.temperature,
            lineLive,
            safeTelemetry.serverTimeMs,
          ),
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
      pipelineStableRef.current = false;
      chartLineLiveRef.current = false;
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

  const resetDowntimeTimer = useCallback(async () => {
    try {
      await storageApi.resetDowntime();
    } catch {
      /* bridge stopped */
    }
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
    const id = window.setInterval(load, DASHBOARD_POLL_MS);
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
    storedOccupancySessionKeys,
    occupancyCurrentSession,
    clearPersistedStorage,
    resetDowntimeTimer,
    alerts,
    refresh: load,
  };
}

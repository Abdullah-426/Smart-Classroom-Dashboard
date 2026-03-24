import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
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
  DASHBOARD_POLL_MS,
  GAUGE_CHART_DEAD_MIN_AGE_MS,
  GAUGE_CHART_LIVE_MAX_AGE_MS,
  PIPELINE_DEAD_MIN_AGE_MS,
  PIPELINE_LIVE_MAX_AGE_MS,
} from "../constants/pipeline";
import { trendRangeMs, type TrendRangeId } from "../constants/temperatureTrend";
import { mergeHistoricWithLive } from "../utils/temperatureTrendSeries";
import {
  readEnergyBaselineWh,
  formatEnergySavedWh,
  parseEnergySavedWh,
  readStoredEnergyWh,
  writeEnergyBaselineWh,
  writeStoredEnergyWh,
} from "../utils/estimatedEnergySavedStorage";

const TREND_FETCH_LIMIT = 12_000;

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

/**
 * Schmitt band + two-poll confirmation above DEAD before flipping to not-live (kills single-sample spikes).
 * `age === null` (missing lastWokwiMqttMs on one HTTP response) keeps previous — real outages use large finite age.
 */
function pipelineStableFromAge(
  age: number | null,
  prevStable: boolean,
  aboveDeadStreak: MutableRefObject<number>,
): boolean {
  if (age === null) return prevStable;
  if (age <= PIPELINE_LIVE_MAX_AGE_MS) {
    aboveDeadStreak.current = 0;
    return true;
  }
  if (age > PIPELINE_DEAD_MIN_AGE_MS) {
    if (!prevStable) {
      aboveDeadStreak.current = 0;
      return false;
    }
    aboveDeadStreak.current += 1;
    return aboveDeadStreak.current >= 2 ? false : true;
  }
  aboveDeadStreak.current = 0;
  return prevStable;
}

function gaugeChartLiveFromAge(
  age: number | null,
  prevLive: boolean,
  aboveDeadStreak: MutableRefObject<number>,
): boolean {
  if (age === null) return prevLive;
  if (age <= GAUGE_CHART_LIVE_MAX_AGE_MS) {
    aboveDeadStreak.current = 0;
    return true;
  }
  if (age >= GAUGE_CHART_DEAD_MIN_AGE_MS) {
    if (!prevLive) {
      aboveDeadStreak.current = 0;
      return false;
    }
    aboveDeadStreak.current += 1;
    return aboveDeadStreak.current >= 2 ? false : true;
  }
  aboveDeadStreak.current = 0;
  return prevLive;
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

    // Phase 1+: device grids (fallback to legacy light/fan booleans).
    lightOnCount:
      typeof input?.lightOnCount === "number" && Number.isFinite(input.lightOnCount)
        ? input.lightOnCount
        : input?.light === 1
          ? 10
          : 0,
    lightTotal: typeof input?.lightTotal === "number" && Number.isFinite(input.lightTotal) ? input.lightTotal : 10,
    lightsMask:
      typeof input?.lightsMask === "number" && Number.isFinite(input.lightsMask)
        ? input.lightsMask
        : input?.light === 1
          ? 0b1111111111
          : 0,

    fanOnCount:
      typeof input?.fanOnCount === "number" && Number.isFinite(input.fanOnCount)
        ? input.fanOnCount
        : input?.fan === 1
          ? 6
          : 0,
    fanTotal: typeof input?.fanTotal === "number" && Number.isFinite(input.fanTotal) ? input.fanTotal : 6,
    fansMask:
      typeof input?.fansMask === "number" && Number.isFinite(input.fansMask)
        ? input.fansMask
        : input?.fan === 1
          ? 0b111111
          : 0,

    // Phase 1+: AC state
    acPower: typeof input?.acPower === "boolean" ? input.acPower : undefined,
    acMode: input?.acMode === "manual" ? "manual" : input?.acMode === "auto" ? "auto" : input?.mode,
    acSetpoint:
      typeof input?.acSetpoint === "number" && Number.isFinite(input.acSetpoint) ? input.acSetpoint : input?.tempThreshold,
    acCoolingActive: typeof input?.acCoolingActive === "boolean" ? input.acCoolingActive : undefined,
    acManualOverride: typeof input?.acManualOverride === "boolean" ? input.acManualOverride : undefined,

    attendanceEvent:
      input?.attendanceEvent && typeof input.attendanceEvent === "object" && typeof input.attendanceEvent.tagId === "string"
        ? input.attendanceEvent
        : null,
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

export function useDashboardData() {
  const [bundle, setBundle] = useState<DashboardBundle | null>(null);
  const bundleRef = useRef<DashboardBundle | null>(null);
  /** After clear storage: keep chart empty until Wokwi/MQTT is live again. */
  const suppressTrendUntilLiveRef = useRef(false);
  const [trendRangeId, setTrendRangeId] = useState<TrendRangeId>("1h");
  const [scheduleState, setScheduleState] = useState<ScheduleStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfoResponse | null>(null);
  /**
   * Header "Updated …" time: same wall clock as Schedule Checker (Node-RED host local via
   * GET /api/schedule-state `serverLocalTime`). Falls back to browser time only if absent.
   */
  const [lastUpdated, setLastUpdated] = useState<string>("-");
  const [pipelineConnected, setPipelineConnected] = useState<boolean | null>(null);
  /** Session keys present in `occupancy-sessions.json` (flag PATCH only works for these). */
  const [storedOccupancySessionKeys, setStoredOccupancySessionKeys] = useState<string[]>([]);
  const [occupancyCurrentSession, setOccupancyCurrentSession] = useState<CurrentOccupancySession | null>(null);
  /** Hysteresis for green/red (matches Node-RED downtime tick after deploy). Unknown telemetry until first good age → not live. */
  const pipelineStableRef = useRef(false);
  /** Count consecutive polls with MQTT age past DEAD while still showing live (need 2 before red). */
  const pipelineAboveDeadStreakRef = useRef(0);
  /** Schmitt for gauge + temperature line segment (~4s / ~6s on MQTT age). */
  const chartLineLiveRef = useRef(false);
  const gaugeAboveDeadStreakRef = useRef(0);
  /** True when the trend chart is drawing a line (Wokwi / MQTT live); gauge uses real °C only then. */
  const [trendLineLive, setTrendLineLive] = useState(false);

  const load = useCallback(async () => {
    try {
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
      const stable = pipelineStableFromAge(age, pipelineStableRef.current, pipelineAboveDeadStreakRef);
      pipelineStableRef.current = stable;
      setPipelineConnected(stable);

      const baselineWh = readEnergyBaselineWh();
      let energyWh = readStoredEnergyWh();
      const summaryEnergyWh = parseEnergySavedWh(safeSummary.estimatedEnergySaved);
      const storageEnergyWh =
        typeof sInfo.estimatedEnergySavedWh === "number" && Number.isFinite(sInfo.estimatedEnergySavedWh)
          ? Math.max(0, sInfo.estimatedEnergySavedWh)
          : 0;
      const hasStorageEnergy = sInfo.ok === true;
      const serverEnergyWh = hasStorageEnergy ? storageEnergyWh : summaryEnergyWh;
      const serverEnergySinceBaselineWh = hasStorageEnergy
        ? serverEnergyWh
        : Math.max(0, serverEnergyWh - baselineWh);
      if (stable) {
        // Keep monotonic local display while still tracking server accumulation from the reset baseline.
        energyWh = Math.max(energyWh, serverEnergySinceBaselineWh);
        writeStoredEnergyWh(energyWh);
      }
      const summaryWithEnergy = {
        ...safeSummary,
        estimatedEnergySaved: formatEnergySavedWh(energyWh),
      };
      const lineLive = gaugeChartLiveFromAge(age, chartLineLiveRef.current, gaugeAboveDeadStreakRef);
      chartLineLiveRef.current = lineLive;
      setTrendLineLive(lineLive);

      const holdEmptyAfterClear = suppressTrendUntilLiveRef.current && !lineLive;
      if (lineLive) {
        suppressTrendUntilLiveRef.current = false;
      }

      const serverNow =
        typeof safeTelemetry.serverTimeMs === "number" && Number.isFinite(safeTelemetry.serverTimeMs)
          ? safeTelemetry.serverTimeMs
          : Date.now();
      const rangeMs = trendRangeMs(trendRangeId);
      const sinceMs = serverNow - rangeMs;

      let historic: TrendPoint[] = [];
      if (!holdEmptyAfterClear) {
        historic = await storageApi.getTrendSince(sinceMs, TREND_FETCH_LIMIT).catch(() => []);
      }

      const nextTrend = holdEmptyAfterClear
        ? []
        : mergeHistoricWithLive(historic, {
            serverTimeMs: safeTelemetry.serverTimeMs,
            temperature: safeTelemetry.temperature,
            lineLive,
            sinceMs,
          });

      setBundle(() => {
        const next: DashboardBundle = {
          telemetry: safeTelemetry,
          summary: summaryWithEnergy,
          ml: safeMl,
          trend: nextTrend,
        };
        bundleRef.current = next;
        return next;
      });
      setError(null);
      setLastUpdated(
        sched.serverLocalTime ??
          new Date().toLocaleTimeString("en-GB", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      pipelineStableRef.current = false;
      pipelineAboveDeadStreakRef.current = 0;
      chartLineLiveRef.current = false;
      gaugeAboveDeadStreakRef.current = 0;
      setTrendLineLive(false);
      setPipelineConnected(false);
    } finally {
      setLoading(false);
    }
  }, [trendRangeId]);

  const clearPersistedStorage = useCallback(async () => {
    // Storage bridge clear now resets persisted cumulative energy, so baseline must also reset.
    writeEnergyBaselineWh(0);

    // Also clear locally persisted estimated energy saved.
    writeStoredEnergyWh(0);
    setBundle((prev) => {
      if (!prev) return prev;
      const next: DashboardBundle = {
        ...prev,
        summary: {
          ...prev.summary,
          estimatedEnergySaved: formatEnergySavedWh(0),
        },
      };
      bundleRef.current = next;
      return next;
    });

    try {
      await storageApi.clear();
    } catch {
      /* Bridge may be stopped; still reset in-memory trend on next load */
    }
    try {
      await storageApi.resetDowntime();
    } catch {
      /* bridge stopped */
    }
    suppressTrendUntilLiveRef.current = true;
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
    if (r.serverLocalTime) {
      setLastUpdated(r.serverLocalTime);
    }
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
    trendLineLive,
    trendRangeId,
    setTrendRangeId,
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

import type { CurrentOccupancySession, OccupancySessionDetail, TrendPoint } from "../types/dashboard";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/** Shown in UI when the bridge is down (Vite proxy → 502 / connection refused). */
export const STORAGE_BRIDGE_HELP =
  "From the project root (folder with storage-bridge.mjs): run npm run storage in a second terminal, or npm run dev:all to start bridge + Vite together.";

export interface OccupancySessionsPayload {
  sessions: OccupancySessionDetail[];
  currentSession: CurrentOccupancySession | null;
}

const EMPTY_OCC_PAYLOAD: OccupancySessionsPayload = { sessions: [], currentSession: null };

export interface StorageInfoResponse {
  ok: boolean;
  dataDirectory?: string;
  telemetryFileBytes?: number;
  telemetrySampleCount?: number;
  occupancySessionCount?: number;
  oldestSampleIso?: string | null;
  newestSampleIso?: string | null;
  /** Successful POST /ingest calls since this bridge process started (diagnostics). */
  bridgeIngestSinceStart?: number;
  bridgeLastIngestIso?: string | null;
  /** Total downtime when pipeline is “off” (persisted). */
  downtimeDisplayMs?: number;
  downtimeTotalMs?: number;
  downtimeOffSinceMs?: number | null;
  error?: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${path}`);
  return (await response.json()) as T;
}

export const storageApi = {
  async getInfo(): Promise<StorageInfoResponse> {
    try {
      return await requestJson<StorageInfoResponse>("/api/storage/info");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const likelyDown =
        /502|503|504|ECONNREFUSED|Failed to fetch|NetworkError/i.test(msg);
      return {
        ok: false,
        error: likelyDown
          ? `Nothing listening on 127.0.0.1:4050 (${msg}). ${STORAGE_BRIDGE_HELP}`
          : msg || "Storage bridge unreachable.",
      };
    }
  },

  async getTrendPoints(limit = 200): Promise<TrendPoint[]> {
    try {
      const r = await requestJson<{ ok: boolean; trend: TrendPoint[] }>(
        `/api/storage/temperature-trend?limit=${limit}`,
      );
      return Array.isArray(r.trend) ? r.trend : [];
    } catch {
      return [];
    }
  },

  /** Samples with receivedAt >= sinceMs (bridge subsamples if the window is huge). */
  async getTrendSince(sinceMs: number, limit = 5000): Promise<TrendPoint[]> {
    try {
      const q = new URLSearchParams({
        sinceMs: String(Math.floor(sinceMs)),
        limit: String(limit),
      });
      const r = await requestJson<{ ok: boolean; trend: TrendPoint[] }>(
        `/api/storage/temperature-trend?${q.toString()}`,
      );
      return Array.isArray(r.trend) ? r.trend : [];
    } catch {
      return [];
    }
  },

  async getOccupancySessions(): Promise<OccupancySessionsPayload> {
    try {
      const r = await requestJson<{
        ok: boolean;
        sessions: OccupancySessionDetail[];
        currentSession?: CurrentOccupancySession | null;
      }>("/api/storage/occupancy-sessions");
      return {
        sessions: Array.isArray(r.sessions) ? r.sessions : [],
        currentSession: r.currentSession && r.currentSession.active === true ? r.currentSession : null,
      };
    } catch {
      return EMPTY_OCC_PAYLOAD;
    }
  },

  async patchOccupancySessionFlag(sessionKey: string, flagged: boolean): Promise<{ ok: boolean; error?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/storage/occupancy-sessions/flag`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey, flagged }),
    });
    let data: { ok: boolean; error?: string } = { ok: false };
    try {
      data = (await response.json()) as { ok: boolean; error?: string };
    } catch {
      /* non-JSON error body */
    }
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  },

  async clear(): Promise<{ ok: boolean }> {
    return requestJson("/api/storage/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  async resetDowntime(): Promise<{ ok: boolean }> {
    return requestJson("/api/storage/downtime/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },
};

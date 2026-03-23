import type {
  AiReportPayload,
  AttendanceLivePayload,
  AttendanceSummaryPayload,
  CommandPayload,
  DashboardSummaryPayload,
  MlPayload,
  ScheduleStateResponse,
  ScheduleToggleResponse,
  TelemetryPayload,
} from "../types/dashboard";
import { getMockAiReport, getMockMl, getMockSummary, getMockTelemetry } from "./mockData";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const FORCE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

const SCHEDULE_TOGGLE_TIMEOUT_MS = 15_000;
const SCHEDULE_STATE_TIMEOUT_MS = 8_000;
/** Groq + Node-RED; allow headroom over the 26s socket timeout and slow networks. */
const AI_REPORT_TIMEOUT_MS = 55_000;

/** IANA zone from the machine running the dashboard; Node-RED stores it on flow for schedule checks. */
function browserClassroomTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function scheduleStatePath(): string {
  const tz = browserClassroomTimeZone();
  if (!tz) return "/api/schedule-state";
  return `/api/schedule-state?classroomTz=${encodeURIComponent(tz)}`;
}

function abortAfter(ms: number): { signal: AbortSignal; clear: () => void } {
  const c = new AbortController();
  const id = window.setTimeout(() => c.abort(), ms);
  return {
    signal: c.signal,
    clear: () => window.clearTimeout(id),
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} on ${path}`);
  }

  return (await response.json()) as T;
}

export const dashboardApi = {
  async getTelemetry(): Promise<TelemetryPayload> {
    if (FORCE_MOCK) return getMockTelemetry(true);
    try {
      // Live data from Node-RED API.
      return await requestJson<TelemetryPayload>("/api/telemetry");
    } catch {
      return getMockTelemetry(false);
    }
  },
  async getSummary(): Promise<DashboardSummaryPayload> {
    if (FORCE_MOCK) return getMockSummary();
    try {
      // Live data from Node-RED API.
      return await requestJson<DashboardSummaryPayload>("/api/dashboard-summary");
    } catch {
      return getMockSummary();
    }
  },
  async getMl(): Promise<MlPayload> {
    if (FORCE_MOCK) return getMockMl();
    try {
      // Live data from Node-RED API.
      return await requestJson<MlPayload>("/api/ml");
    } catch {
      return getMockMl();
    }
  },
  async sendCommand(command: CommandPayload): Promise<{ ok: boolean; error?: string }> {
    if (FORCE_MOCK) return { ok: true };
    try {
      // Node-RED POST /api/command should publish MQTT command payloads to Wokwi topic.
      const res = await requestJson<{ ok?: boolean; error?: string }>("/api/command", {
        method: "POST",
        body: JSON.stringify(command),
      });
      if (res && res.ok === false) {
        return { ok: false, error: typeof res.error === "string" ? res.error : "Command rejected by API" };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
  async generateAiReport(): Promise<AiReportPayload> {
    if (FORCE_MOCK) return getMockAiReport();
    const { signal, clear } = abortAfter(AI_REPORT_TIMEOUT_MS);
    const envHint =
      "Fix Docker .env: use exactly GROQ_API_KEY=gsk_your_key (no spaces around =, no quotes). Recreate the container with --env-file. See docs/DOCKER-NODERED.md.";
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "frontend-dashboard" }),
        signal,
      });
      const rawText = await response.text();
      let data: Record<string, unknown> = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          throw new Error("Non-JSON from Node-RED");
        }
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const summary =
        typeof data.summary === "string"
          ? data.summary
          : typeof data.message === "string"
            ? data.message
            : "";
      return {
        ok: data.ok === true,
        summary,
        generatedAt:
          typeof data.generatedAt === "string" ? data.generatedAt : new Date().toISOString(),
        model: typeof data.model === "string" ? data.model : undefined,
        source: typeof data.source === "string" ? data.source : undefined,
      };
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      return {
        ok: false,
        summary: aborted
          ? `AI request timed out (${Math.round(AI_REPORT_TIMEOUT_MS / 1000)}s). From Docker, check outbound HTTPS to api.groq.com. ${envHint}`
          : `Could not get an AI report (connection or server error). Is Node-RED on port 1880? Restart Vite after pulling (proxy uses 127.0.0.1). ${envHint}`,
        generatedAt: new Date().toISOString(),
        model: "fallback",
        source: "local",
      };
    } finally {
      clear();
    }
  },
  async toggleSchedule(): Promise<ScheduleToggleResponse> {
    if (FORCE_MOCK) {
      const now = new Date();
      const msFromMidnight =
        ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
      const inWindow = msFromMidnight >= 8 * 60 * 60 * 1000 && msFromMidnight < 18 * 60 * 60 * 1000;
      return {
        ok: true,
        scheduleEnabled: false,
        command: { forceOff: false, afterHoursAlert: false },
        inScheduleWindow: inWindow,
        serverTimeIso: now.toISOString(),
        serverLocalTime: now.toLocaleTimeString("en-GB", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        scheduleWindowLabel: "08:00–18:00 (mock)",
      };
    }
    const { signal, clear } = abortAfter(SCHEDULE_TOGGLE_TIMEOUT_MS);
    try {
      return await requestJson<ScheduleToggleResponse>("/api/schedule-toggle", {
        method: "POST",
        body: JSON.stringify({
          source: "frontend-dashboard",
          classroomTz: browserClassroomTimeZone(),
        }),
        signal,
      });
    } catch {
      const st = abortAfter(SCHEDULE_STATE_TIMEOUT_MS);
      try {
        const s = await requestJson<ScheduleStateResponse>(scheduleStatePath(), { signal: st.signal });
        return {
          ok: true,
          scheduleEnabled: s.scheduleEnabled,
          command: { forceOff: false, afterHoursAlert: false },
          inScheduleWindow: s.inScheduleWindow,
          serverTimeIso: s.serverTimeIso,
          serverLocalTime: s.serverLocalTime,
          scheduleWindowLabel: s.scheduleWindowLabel,
        };
      } catch {
        const now = new Date();
        const msFromMidnight =
          ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
        const inWindow = msFromMidnight >= 8 * 60 * 60 * 1000 && msFromMidnight < 18 * 60 * 60 * 1000;
        return {
          ok: true,
          scheduleEnabled: false,
          command: { forceOff: false, afterHoursAlert: false },
          inScheduleWindow: inWindow,
          serverLocalTime: now.toLocaleTimeString("en-GB", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          scheduleWindowLabel: "08:00–18:00",
        };
      } finally {
        st.clear();
      }
    } finally {
      clear();
    }
  },
  async getScheduleState(): Promise<ScheduleStateResponse> {
    if (FORCE_MOCK) {
      const now = new Date();
      const msFromMidnight =
        ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
      const inWindow = msFromMidnight >= 8 * 60 * 60 * 1000 && msFromMidnight < 18 * 60 * 60 * 1000;
      return {
        ok: true,
        scheduleEnabled: true,
        inScheduleWindow: inWindow,
        serverTimeIso: now.toISOString(),
        serverLocalTime: now.toLocaleTimeString("en-GB", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        scheduleWindowLabel: "08:00–18:00 (mock)",
      };
    }
    try {
      // Live data from Node-RED API.
      return await requestJson<ScheduleStateResponse>(scheduleStatePath());
    } catch {
      const now = new Date();
      const msFromMidnight =
        ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
      const inWindow = msFromMidnight >= 8 * 60 * 60 * 1000 && msFromMidnight < 18 * 60 * 60 * 1000;
      return {
        ok: true,
        scheduleEnabled: true,
        inScheduleWindow: inWindow,
        serverLocalTime: now.toLocaleTimeString("en-GB", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        scheduleWindowLabel: "08:00–18:00",
      };
    }
  },

  async getAttendance(): Promise<AttendanceSummaryPayload> {
    if (FORCE_MOCK) {
      return {
        ok: true,
        session: {
          sessionStartMs: Date.now() - 30 * 60 * 1000,
          sessionEndMs: Date.now() + 2 * 60 * 60 * 1000,
          lateAfterMs: Date.now() - 20 * 60 * 1000,
          absenceTimeoutMs: 60_000,
        },
        presentCount: 0,
        tags: [],
      };
    }
    return requestJson<AttendanceSummaryPayload>("/api/attendance");
  },

  async resetAttendance(): Promise<{ ok: boolean }> {
    if (FORCE_MOCK) return { ok: true };
    return requestJson("/api/attendance/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  async getAttendanceLive(): Promise<AttendanceLivePayload> {
    if (FORCE_MOCK) {
      return {
        ok: true,
        className: "Smart Classroom Demo",
        courseName: "IoT Systems Lab",
        section: "CSE-A",
        session: {
          sessionId: null,
          active: false,
          startedAtMs: null,
          endedAtMs: null,
          lateAfterMs: null,
          duplicateSuppressMs: 5000,
          absenceTimeoutMs: 60_000,
          nowMs: Date.now(),
        },
        stats: {
          rosterCount: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          invalidCount: 0,
          duplicateCount: 0,
          attendancePercent: 0,
        },
        students: [],
        recentScans: [],
      };
    }
    return requestJson<AttendanceLivePayload>("/api/attendance/live");
  },

  async startAttendanceSession(input?: {
    className?: string;
    courseName?: string;
    section?: string;
    lateAfterMinutes?: number;
    duplicateSuppressMs?: number;
    absenceTimeoutMs?: number;
  }): Promise<{ ok: boolean }> {
    if (FORCE_MOCK) return { ok: true };
    return requestJson("/api/attendance/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input || {}),
    });
  },

  async endAttendanceSession(): Promise<{ ok: boolean }> {
    if (FORCE_MOCK) return { ok: true };
    return requestJson("/api/attendance/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  },

  attendanceExportCsvUrl(): string {
    return `${API_BASE_URL}/api/attendance/export.csv`;
  },
};

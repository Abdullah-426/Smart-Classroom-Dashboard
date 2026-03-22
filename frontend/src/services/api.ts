import type {
  AiReportPayload,
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
      // TODO: Node-RED should expose GET /api/telemetry with Wokwi-aligned fields.
      return await requestJson<TelemetryPayload>("/api/telemetry");
    } catch {
      return getMockTelemetry(false);
    }
  },
  async getSummary(): Promise<DashboardSummaryPayload> {
    if (FORCE_MOCK) return getMockSummary();
    try {
      // TODO: Node-RED should expose GET /api/dashboard-summary.
      return await requestJson<DashboardSummaryPayload>("/api/dashboard-summary");
    } catch {
      return getMockSummary();
    }
  },
  async getMl(): Promise<MlPayload> {
    if (FORCE_MOCK) return getMockMl();
    try {
      // TODO: Node-RED should expose GET /api/ml.
      return await requestJson<MlPayload>("/api/ml");
    } catch {
      return getMockMl();
    }
  },
  async sendCommand(command: CommandPayload): Promise<{ ok: boolean }> {
    if (FORCE_MOCK) return { ok: true };
    try {
      // TODO: Node-RED should expose POST /api/command and publish MQTT commands.
      await requestJson("/api/command", {
        method: "POST",
        body: JSON.stringify(command),
      });
      return { ok: true };
    } catch {
      return { ok: true };
    }
  },
  async generateAiReport(): Promise<AiReportPayload> {
    if (FORCE_MOCK) return getMockAiReport();
    try {
      // TODO: Node-RED should expose POST /api/ai-report.
      return await requestJson<AiReportPayload>("/api/ai-report", {
        method: "POST",
        body: JSON.stringify({ source: "frontend-dashboard" }),
      });
    } catch {
      return getMockAiReport();
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
      // TODO: Node-RED should expose GET /api/schedule-state.
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
};

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
    if (FORCE_MOCK) return getMockTelemetry();
    try {
      // TODO: Node-RED should expose GET /api/telemetry with Wokwi-aligned fields.
      return await requestJson<TelemetryPayload>("/api/telemetry");
    } catch {
      return getMockTelemetry();
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
      return {
        ok: true,
        scheduleEnabled: false,
        command: { forceOff: false, afterHoursAlert: false },
      };
    }
    try {
      // TODO: Node-RED should expose POST /api/schedule-toggle.
      return await requestJson<ScheduleToggleResponse>("/api/schedule-toggle", {
        method: "POST",
        body: JSON.stringify({ source: "frontend-dashboard" }),
      });
    } catch {
      return {
        ok: true,
        scheduleEnabled: false,
        command: { forceOff: false, afterHoursAlert: false },
      };
    }
  },
  async getScheduleState(): Promise<ScheduleStateResponse> {
    if (FORCE_MOCK) return { ok: true, scheduleEnabled: true };
    try {
      // TODO: Node-RED should expose GET /api/schedule-state.
      return await requestJson<ScheduleStateResponse>("/api/schedule-state");
    } catch {
      return { ok: true, scheduleEnabled: true };
    }
  },
};

export type ModeType = "auto" | "manual";

export interface TelemetryPayload {
  temperature: number;
  motion: boolean;
  occupied: boolean;
  light: 0 | 1;
  fan: 0 | 1;
  mode: ModeType;
  forceOff: boolean;
  afterHoursAlert: boolean;
  tempThreshold: number;
  /** Node-RED host epoch ms when /api/telemetry was built (for pipeline age). */
  serverTimeMs?: number;
  /** Node-RED host epoch ms when last MQTT telemetry (e.g. Wokwi) was received. `null` if unknown (never use 0 sentinel). */
  lastWokwiMqttMs?: number | null;
}

export interface OccupancySessionDetail {
  sessionNumber: number | null;
  durationText: string;
  durationMinutes?: number;
  durationSeconds?: number;
  startedAtIso: string | null;
  endedAtIso: string | null;
  legacy?: boolean;
  /** User flag; persisted in `data/occupancy-sessions.json` via storage bridge. */
  flagged?: boolean;
}

/** In-progress occupancy from storage-bridge state (room currently occupied). */
export interface CurrentOccupancySession {
  active: true;
  sessionNumber: number | null;
  startedAtIso: string | null;
  durationSoFarText: string;
}

export interface DashboardSummaryPayload {
  roomStatus: string;
  light: 0 | 1;
  fan: 0 | 1;
  mode: ModeType;
  collegeHours: string;
  alerts: string[];
  temperature: number;
  occupied: boolean;
  afterHoursAlert: boolean;
  tempThreshold: number;
  occupancyTimer: string;
  occupancySessions: number;
  /** Completed sessions (newest first); from Node-RED flow context */
  occupancySessionList?: OccupancySessionDetail[];
  estimatedEnergySaved: string;
  highTempWarning: string;
}

export interface MlPayload {
  predictedTemp: number;
  slopePerMin: number;
  confidence: number;
  mae: number | null;
  anomaly: boolean;
  assist: boolean;
  statusText: string;
}

export interface AiReportPayload {
  summary: string;
  generatedAt: string;
  /** Present when Node-RED returns Phase C metadata */
  ok?: boolean;
  model?: string;
  source?: string;
}

export interface ScheduleToggleResponse {
  ok: boolean;
  scheduleEnabled: boolean;
  command: {
    forceOff: boolean;
    afterHoursAlert: boolean;
  };
  /** Node-RED host local clock: inside [08:00, 18:00) */
  inScheduleWindow?: boolean;
  serverTimeIso?: string;
  serverLocalTime?: string;
  scheduleWindowLabel?: string;
}

export interface ScheduleStateResponse {
  ok: boolean;
  scheduleEnabled: boolean;
  inScheduleWindow?: boolean;
  serverTimeIso?: string;
  serverLocalTime?: string;
  scheduleWindowLabel?: string;
}

export interface TrendPoint {
  time: string;
  /** Monotonic x-axis (epoch ms, usually server clock). Avoids duplicate `time` strings breaking Recharts. */
  atMs?: number;
  /** `null` breaks the chart line when the pipeline / Wokwi is not live. */
  temperature: number | null;
}

export interface CommandPayload {
  mode?: ModeType;
  light?: 0 | 1;
  fan?: 0 | 1;
  tempThreshold?: number;
  forceOff?: boolean;
  afterHoursAlert?: boolean;
}

export interface DashboardBundle {
  telemetry: TelemetryPayload;
  summary: DashboardSummaryPayload;
  ml: MlPayload;
  trend: TrendPoint[];
}

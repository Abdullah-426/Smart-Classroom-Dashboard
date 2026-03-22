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
  /** Node-RED host epoch ms when last MQTT telemetry (e.g. Wokwi) was received. */
  lastWokwiMqttMs?: number;
}

export interface OccupancySessionDetail {
  sessionNumber: number | null;
  durationText: string;
  durationMinutes?: number;
  durationSeconds?: number;
  startedAtIso: string | null;
  endedAtIso: string | null;
  legacy?: boolean;
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
  temperature: number;
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

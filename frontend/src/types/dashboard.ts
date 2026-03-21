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
}

export interface ScheduleStateResponse {
  ok: boolean;
  scheduleEnabled: boolean;
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

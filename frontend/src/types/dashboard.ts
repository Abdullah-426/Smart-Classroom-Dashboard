export type ModeType = "auto" | "manual";

export type AttendanceEventType = "present";

export interface AttendanceEventPayload {
  tagId: string;
  eventType: AttendanceEventType;
}

export interface AttendanceTagSummary {
  tagId: string;
  firstSeenAtIso: string;
  lastSeenAtIso: string;
  eventCount: number;
  late: boolean;
  present: boolean;
  endedAtIso: string | null;
}

export interface AttendanceSummaryPayload {
  ok: boolean;
  session: {
    sessionStartMs: number;
    sessionEndMs: number;
    lateAfterMs: number;
    absenceTimeoutMs: number;
  };
  presentCount: number;
  tags: AttendanceTagSummary[];
}

export type AttendanceScanStatus = "present" | "late" | "duplicate" | "invalid";
export type AttendanceStudentState = "present" | "late" | "absent";

export interface AttendanceLiveScanRow {
  receivedAtIso: string;
  tagId: string;
  status: AttendanceScanStatus;
  reason: string;
  studentId: string | null;
  studentName: string | null;
}

export interface AttendanceStudentRow {
  studentId: string;
  name: string;
  section: string;
  tagId: string;
  state: AttendanceStudentState;
  firstSeenAtIso: string | null;
  lastSeenAtIso: string | null;
  scanCount: number;
  attendancePercent: number;
}

export interface AttendanceLivePayload {
  ok: boolean;
  className: string;
  courseName: string;
  section: string;
  session: {
    sessionId: string | null;
    active: boolean;
    startedAtMs: number | null;
    endedAtMs: number | null;
    lateAfterMs: number | null;
    duplicateSuppressMs: number;
    absenceTimeoutMs: number;
    nowMs: number;
  };
  stats: {
    rosterCount: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    invalidCount: number;
    duplicateCount: number;
    attendancePercent: number;
  };
  students: AttendanceStudentRow[];
  recentScans: AttendanceLiveScanRow[];
}

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

  /** Phase 1+: 10 lights (tubelights) */
  lightOnCount?: number;
  lightTotal?: number;
  lightsMask?: number; // 10 bits (0..1023)

  /** Phase 1+: 6 fans */
  fanOnCount?: number;
  fanTotal?: number;
  fansMask?: number; // 6 bits (0..63)

  /** Phase 1+: AC control */
  acPower?: boolean;
  acMode?: ModeType;
  acSetpoint?: number;
  acCoolingActive?: boolean;
  acManualOverride?: boolean;

  /** Attendance event embedded in telemetry (one-shot; used primarily for live debugging). */
  attendanceEvent?: AttendanceEventPayload | null;
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
  /**
   * Firmware supports:
   * - boolean => ON means full grid (10 lights / 6 fans)
   * - number => 0..10 (lights) or 0..6 (fans)
   */
  light?: boolean | number;
  fan?: boolean | number;
  tempThreshold?: number;
  forceOff?: boolean;
  afterHoursAlert?: boolean;

  // AC commands (Phase 1+)
  acPower?: boolean;
  acMode?: ModeType;
  acSetpoint?: number;
}

export interface DashboardBundle {
  telemetry: TelemetryPayload;
  summary: DashboardSummaryPayload;
  ml: MlPayload;
  trend: TrendPoint[];
}

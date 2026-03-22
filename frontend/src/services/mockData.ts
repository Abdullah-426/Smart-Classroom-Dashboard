import type {
  AiReportPayload,
  DashboardSummaryPayload,
  MlPayload,
  TelemetryPayload,
} from "../types/dashboard";

const telemetrySamples: TelemetryPayload[] = [
  {
    temperature: 20.5,
    motion: false,
    occupied: false,
    light: 0,
    fan: 0,
    mode: "auto",
    forceOff: false,
    afterHoursAlert: false,
    tempThreshold: 28,
  },
  {
    temperature: 29.4,
    motion: true,
    occupied: true,
    light: 1,
    fan: 0,
    mode: "auto",
    forceOff: false,
    afterHoursAlert: false,
    tempThreshold: 28,
  },
  {
    temperature: 39.4,
    motion: true,
    occupied: true,
    light: 0,
    fan: 1,
    mode: "auto",
    forceOff: false,
    afterHoursAlert: false,
    tempThreshold: 26.5,
  },
];

let pointer = 0;

/** `livePipeline`: when true (dev mock mode), header dot is green; false when API failed — show disconnected. */
export function getMockTelemetry(livePipeline = false): TelemetryPayload {
  pointer = (pointer + 1) % telemetrySamples.length;
  const sample = telemetrySamples[pointer];
  if (!livePipeline) return { ...sample };
  const now = Date.now();
  return { ...sample, serverTimeMs: now, lastWokwiMqttMs: now };
}

export function getMockSummary(): DashboardSummaryPayload {
  const telemetry = telemetrySamples[pointer];
  const hot = telemetry.temperature > telemetry.tempThreshold + 2;
  const alerts: string[] = [];

  if (telemetry.afterHoursAlert) alerts.push("Outside college hours while occupied.");
  if (hot) alerts.push("Temperature is above target threshold.");

  return {
    roomStatus: telemetry.occupied ? "Occupied" : "Empty",
    light: telemetry.light,
    fan: telemetry.fan,
    mode: telemetry.mode,
    collegeHours: telemetry.afterHoursAlert
      ? "Outside scheduled hours (08:00–18:00)"
      : "Within scheduled hours (08:00–18:00)",
    alerts,
    temperature: telemetry.temperature,
    occupied: telemetry.occupied,
    afterHoursAlert: telemetry.afterHoursAlert,
    tempThreshold: telemetry.tempThreshold,
    occupancyTimer: telemetry.occupied ? "12 min 08 sec" : "0 min 00 sec",
    occupancySessions: 3,
    occupancySessionList: [
      {
        sessionNumber: 3,
        durationText: "8 min 12 sec",
        durationMinutes: 8,
        durationSeconds: 492,
        startedAtIso: new Date(Date.now() - 3_600_000).toISOString(),
        endedAtIso: new Date(Date.now() - 2_900_000).toISOString(),
      },
      {
        sessionNumber: 2,
        durationText: "4 min 05 sec",
        durationMinutes: 4,
        durationSeconds: 245,
        startedAtIso: new Date(Date.now() - 8_000_000).toISOString(),
        endedAtIso: new Date(Date.now() - 7_755_000).toISOString(),
      },
      {
        sessionNumber: 1,
        durationText: "12 min 00 sec",
        durationMinutes: 12,
        durationSeconds: 720,
        startedAtIso: new Date(Date.now() - 20_000_000).toISOString(),
        endedAtIso: new Date(Date.now() - 19_280_000).toISOString(),
      },
    ],
    estimatedEnergySaved: "138 Wh",
    highTempWarning: hot ? "High temperature detected" : "No high temperature warning",
  };
}

export function getMockMl(): MlPayload {
  return {
    predictedTemp: 39.1,
    slopePerMin: 0.18,
    confidence: 0.91,
    mae: 0.36,
    anomaly: false,
    assist: false,
    statusText: "Monitoring",
  };
}

export function getMockAiReport(): AiReportPayload {
  return {
    ok: true,
    summary:
      "Classroom is stable. Auto mode is active and occupancy trends are within expected range. Continue monitoring threshold and fan cycle for optimization.",
    generatedAt: new Date().toISOString(),
    model: "mock",
    source: "local",
  };
}

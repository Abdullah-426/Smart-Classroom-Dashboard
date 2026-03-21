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

export function getMockTelemetry(): TelemetryPayload {
  pointer = (pointer + 1) % telemetrySamples.length;
  return telemetrySamples[pointer];
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
      ? "Outside college hours"
      : "Within college hours",
    alerts,
    temperature: telemetry.temperature,
    occupied: telemetry.occupied,
    afterHoursAlert: telemetry.afterHoursAlert,
    tempThreshold: telemetry.tempThreshold,
    occupancyTimer: telemetry.occupied ? "12 min 08 sec" : "0 min 00 sec",
    occupancySessions: 8,
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
    summary:
      "Classroom is stable. Auto mode is active and occupancy trends are within expected range. Continue monitoring threshold and fan cycle for optimization.",
    generatedAt: new Date().toISOString(),
  };
}

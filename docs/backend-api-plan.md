# Planned Node-RED API endpoints

## GET /api/telemetry
Returns latest raw telemetry from Wokwi via Node-RED, plus pipeline hints (added by the **API Get Telemetry** function, not stored in `latestTelemetry` context):
- `serverTimeMs` — Node-RED `Date.now()` when the response is built
- `lastWokwiMqttMs` — Node-RED `Date.now()` when **Enrich Telemetry** last ran on an incoming MQTT payload (updated every Wokwi publish)

The dashboard uses **hysteresis** on telemetry age for the **header dot** (**≤4s** live, **>7s** dead, hold between). The **temperature chart** uses a **wider Schmitt band** (**≤8s** live, **≥22s** dead, hold between) so brief MQTT jitter or missing timestamps do not insert one-poll gaps; the X-axis uses epoch **`atMs`** (not second-only labels) so Recharts does not break on duplicate `time` strings. **~1s** polling.

## GET /api/dashboard-summary
Returns processed dashboard fields such as:
- roomStatus
- light
- fan
- mode
- collegeHours — recomputed on each GET from `flow.scheduleEnabled` + `latestTelemetry.forceOff` so HTTP schedule toggles match Live Status without waiting for the next MQTT packet
- alerts
- temperature
- occupied
- afterHoursAlert
- tempThreshold
- occupancyTimer
- occupancySessions
- occupancySessionList (array of session objects: sessionNumber, durationText, durationMinutes, durationSeconds, startedAtIso, endedAtIso; legacy entries may omit timestamps)
- estimatedEnergySaved
- highTempWarning

## GET /api/ml
Returns:
- predictedTemp
- slopePerMin
- confidence
- mae
- anomaly
- assist
- statusText

## POST /api/command
Accepts commands like:
- { "mode": "auto" }
- { "light": 1, "mode": "manual" }
- { "fan": 1, "mode": "manual" }
- { "fan": 0, "mode": "manual" }
- { "light": 0, "mode": "manual" }
- { "mode": "auto", "tempThreshold": 26.5 }

## POST /api/ai-report
Temporary placeholder for Phase C.

## Local storage bridge (separate process)

Not served by Node-RED. Run `npm run storage` from the repo root; Vite dev proxies `/api/storage` to `http://127.0.0.1:4050`. See `docs/storage-bridge.md`.

## Schedule checker (Node-RED host clock)

When **schedule checker** is enabled (`flow.scheduleEnabled`, default `true`), a repeating inject fires **Schedule Checker**, which publishes MQTT commands using the **Node-RED machine’s local system time**:

- **Active window:** `08:00:00.000` inclusive → `18:00:00.000` exclusive (same calendar day). Sub-minute accuracy via ms-from-midnight. API `scheduleWindowLabel` is the short range `08:00–18:00` (times are Node-RED host local).
- **`forceOff` / `afterHoursAlert`:** both `false` inside the window; both `true` outside (lights/fan policy + after-hours motion alert path on firmware/flow).

When the checker is **disabled**, flows send `forceOff: false` and `afterHoursAlert: false` so manual/testing is not overridden.

### GET /api/schedule-state
JSON: `ok`, `scheduleEnabled`, `inScheduleWindow`, `serverTimeIso`, `serverLocalTime`, `scheduleWindowLabel`.

### POST /api/schedule-toggle
Toggles `scheduleEnabled`, publishes the appropriate command to MQTT, returns the same fields as above plus `command` `{ forceOff, afterHoursAlert }`.

**Note:** Re-import `all_flows_edit.json` after edits. The dashboard polls schedule state with telemetry so the Controls card stays in sync with the host clock.

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
Phase C: Groq **Chat Completions** (`POST /v1/chat/completions`, model from `GROQ_MODEL`, default `openai/gpt-oss-20b`) via a **Function** node using Node **`https`** (26s timeout, `await`) so the `/api/ai-report` request finishes reliably; local rule-based fallback when the key is unset or the call fails. Requires **`functionExternalModules: true`** in Node-RED `settings.js` if your image disables external modules by default. Function nodes read **`GROQ_*` via `env.get(...)`** (not `process.env`, which is unavailable in the Function VM); Docker `-e` / `--env-file` still supplies those values.

**Response (success):** `ok`, `summary` (plain text, typically four lines), `generatedAt` (ISO), `model`, `source` (`groq` or `local`).

**Optional JSON body:** `highQuality`, `demoMode`, or `screenshotMode` — any `true` selects `GROQ_MODEL_HIGH_QUALITY` (default `openai/gpt-oss-120b`) when configured.

Env vars (Node-RED process): `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_MODEL_HIGH_QUALITY` — see `node-red.env.example`.

## Local storage bridge (separate process)

Not served by Node-RED. Run `npm run storage` from the repo root; Vite dev proxies `/api/storage` to `http://127.0.0.1:4050`. See `docs/storage-bridge.md`.

## Schedule checker (classroom wall clock)

When **schedule checker** is enabled (`flow.scheduleEnabled`, default `true`), a repeating inject fires **Schedule Checker**, which publishes MQTT commands using **08:00–18:00 in a configured timezone**:

- **Primary:** The dashboard sends `GET /api/schedule-state?classroomTz=<IANA>` (browser `Intl` zone). Node-RED stores it on `flow.scheduleTimeZone` and uses it for `inScheduleWindow`, MQTT `forceOff` / `afterHoursAlert`, and `serverLocalTime` in the API.
- **Fallback:** Environment variable `CLASSROOM_TIMEZONE` (IANA), e.g. `Asia/Dubai`, when no dashboard has set flow context yet.
- **Last resort:** Node’s local clock (`getHours()`), which is often **UTC** in Docker — without `classroomTz` or `CLASSROOM_TIMEZONE`, evening local time can wrongly appear “within hours” if UTC is still afternoon.

- **Active window:** `08:00:00.000` inclusive → `18:00:00.000` exclusive (same calendar day). Sub-minute accuracy via ms-from-midnight. API `scheduleWindowLabel` is the short range `08:00–18:00` (wall time in the zone above).
- **`forceOff` / `afterHoursAlert`:** both `false` inside the window; both `true` outside (lights/fan policy + after-hours motion alert path on firmware/flow).

When the checker is **disabled**, flows send `forceOff: false` and `afterHoursAlert: false` so manual/testing is not overridden.

### GET /api/schedule-state
JSON: `ok`, `scheduleEnabled`, `inScheduleWindow`, `serverTimeIso`, `serverLocalTime`, `scheduleWindowLabel`.

### POST /api/schedule-toggle
Toggles `scheduleEnabled`, publishes the appropriate command to MQTT, returns the same fields as above plus `command` `{ forceOff, afterHoursAlert }`.

**Note:** Re-import `all_flows_edit.json` after edits. The dashboard polls schedule state with telemetry and sends `classroomTz` so the Controls card and Schedule Checker use the same wall clock as the browser.

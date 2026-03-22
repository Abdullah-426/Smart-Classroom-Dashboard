# Verification checklist (Smart Classroom Dashboard)

Use this after setup (`RUN-STEPS.txt`) or when changing Node-RED flows / the storage bridge.

## Storage bridge (`storage-bridge.mjs`, port **4050**)

| Check | How |
|--------|-----|
| Process listening | `http://127.0.0.1:4050/api/storage/info` → JSON `"ok": true` |
| Ingest | With Wokwi + Node-RED running, **`bridgeIngestSinceStart`** increases; **`data/telemetry.jsonl`** grows |
| Telemetry trend | `GET /api/storage/temperature-trend?limit=5` → array of points with `atMs` |
| Occupancy file | `GET /api/storage/occupancy-sessions` → `sessions` array; new completed sessions get **`flagged: false`** |
| Current session | While room is **occupied**, same GET includes **`currentSession`** with `active: true` |
| Session flag | `PATCH /api/storage/occupancy-sessions/flag` with valid `sessionKey` toggles **`flagged`** in **`data/occupancy-sessions.json`** |
| Downtime | `POST /api/storage/downtime/tick` with `{ "isLive": true/false }` updates **`data/downtime.json`**; dashboard Analytics total matches when bridge is up |
| Downtime reset | `POST /api/storage/downtime/reset` zeros total (dashboard reset button) |

## Node-RED (`all_flows_edit.json`)

| Check | How |
|--------|-----|
| Import / Deploy | Flow deployed with no missing wires on HTTP/MQTT nodes |
| Storage POST URL | **Docker:** `http://host.docker.internal:4050/ingest` — **host NR:** `http://127.0.0.1:4050/ingest` |
| Downtime tick URL | Same host pattern: `/api/storage/downtime/tick` |
| Telemetry API | Dashboard loads: **GET** telemetry/summary/ML hit Node-RED (Vite proxy → `:1880` by default) |
| Pipeline hysteresis | **Build downtime tick POST** uses **LIVE_MS 4000** / **DEAD_MS 7000** (must match `frontend/src/constants/pipeline.ts`) |
| Prepare storage | **`STORAGE_GAP_OK_MS`** (MQTT gap) aligned with project docs (e.g. **10000** ms) |

## Dashboard (Vite)

| Check | How |
|--------|-----|
| Header pipeline dot | Green when MQTT fresh; red after prolonged silence (hysteresis) |
| Temperature trend | Line continuous while publishing; gaps only after long silence (chart Schmitt) |
| Analytics | Energy, occupancy timer, **Occupancy sessions** opens full-screen table with blur |
| Session flags | Checkbox enabled only for rows backed by **`occupancy-sessions.json`**; persists after refresh |
| Storage panel | Shows bridge reachable + sample counts |
| Clear storage | Clears telemetry + sessions + bridge state (confirm in UI) |

## Known coupling

- **Occupancy merge key** is `startedAtIso|endedAtIso|durationText` (frontend `occupancySessionKey` and bridge must stay identical).
- Restart the **storage bridge** after pulling changes to `storage-bridge.mjs` (new routes / schema).

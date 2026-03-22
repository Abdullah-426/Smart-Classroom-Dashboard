# Local storage bridge

Persists telemetry samples and derived occupancy sessions under `data/` in the project root (gitignored).

## Run

From **project root** (same folder as `storage-bridge.mjs`):

```bash
npm install   # installs devDependency `concurrently` for `npm run dev:all`
npm run storage
```

**One command (bridge + Vite):** from project root, after `npm install`:

```bash
npm run dev:all
```

Default URL: `http://127.0.0.1:4050`

- `POST /ingest` — JSON body (Node-RED **Prepare storage POST** → **POST storage bridge**)
- `GET /api/storage/info` — sizes, counts, time range, plus **`bridgeIngestSinceStart`** / **`bridgeLastIngestIso`** (whether Node-RED has POSTed since this bridge started)
- `GET /api/storage/temperature-trend?limit=200` — points for the chart
- `GET /api/storage/occupancy-sessions` — completed sessions
- `POST /api/storage/clear` — wipe files and reset state

## Frontend dev

Vite proxies `/api/storage/*` to the bridge on **4050**. With `npm run dev` in `frontend/`, you must **also** run `npm run storage` at the root, or use `npm run dev:all` at the root instead of two terminals.

### Troubleshooting: HTTP 502 / ECONNREFUSED on `/api/storage/*`

- **Cause:** The storage bridge is not running, so nothing listens on `127.0.0.1:4050`. Vite’s proxy then fails (terminal may show `connect ECONNREFUSED 127.0.0.1:4050`).
- **Fix:** From project root run `npm run storage` (leave running) or `npm run dev:all`.
- **Verify:** In a browser or curl, `http://127.0.0.1:4050/api/storage/info` should return JSON with `"ok": true` while the bridge is up.

## Node-RED

Re-import `all_flows_edit.json` so **Enrich Telemetry** also wires **Prepare storage POST** → **POST storage bridge** → optional debug **storage bridge response** (enable **active** on that debug node to see successful POSTs).

If the bridge is not running, the HTTP node may log errors; MQTT/UI behaviour is unchanged.

### Troubleshooting: dashboard shows “Reachable” but 0 samples / empty `data/`

The browser only talks to the bridge. **Persistence requires Node-RED** to `POST` JSON to `/ingest` on the **same machine that runs the bridge** (your PC at `127.0.0.1:4050` by default).

1. Open `http://127.0.0.1:4050/api/storage/info` and check **`bridgeIngestSinceStart`**. If it stays `0`, Node-RED has never successfully reached this process.
2. **Docker / WSL:** Inside a container, `127.0.0.1` is the container itself, not Windows. Set the HTTP Request URL to `http://host.docker.internal:4050/ingest` (Docker Desktop on Windows/Mac), or your host LAN IP, or use host networking.
3. **HTTP proxy:** If `HTTP_PROXY` is set for Node-RED, set `NO_PROXY=127.0.0.1,localhost,host.docker.internal` so local POSTs are not sent through the proxy.
4. **Manual test** (bridge running on same PC), PowerShell:

```powershell
curl.exe -X POST http://127.0.0.1:4050/ingest -H "Content-Type: application/json" -d '{"temperature":22,"motion":true,"occupied":false}'
```

Then reload the dashboard — telemetry sample count should be > 0 and `data/telemetry.jsonl` should exist.

5. **Verbose bridge logs:** `set STORAGE_BRIDGE_LOG_INGEST=1` then `npm run storage` — prints one line per successful ingest.

## Environment

| Variable | Default |
|----------|---------|
| `STORAGE_BRIDGE_PORT` | `4050` |
| `STORAGE_BRIDGE_HOST` | `127.0.0.1` (use `0.0.0.0` in dev if Docker cannot POST to the bridge) |
| `STORAGE_BRIDGE_LOG_INGEST` | unset (`1` = log each `/ingest`) |

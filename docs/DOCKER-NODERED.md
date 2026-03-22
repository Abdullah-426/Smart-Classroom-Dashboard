# Node-RED in Docker (Windows + Groq)

Use this if you run Node-RED as a named container (e.g. `mynodered`) with a **host folder** mounted to `/data` so flows persist.

## Your typical layout

Many students keep two folders side by side:

- `...\Smart Classroom\` — Node-RED user data: `node-red\data\` → mounted as `/data` in the container  
- `...\Smart Classroom Dashboard\` — this repo: `all_flows_edit.json`, Vite app, storage bridge  

The **Groq API key** must be passed into the **container** (Docker env). A `.env` file on the host is only read if you use `--env-file` or Compose `env_file:`.

## 1. Create a secrets file (host)

In a folder **outside** git or **gitignored** (this repo ignores `.env` and `groq.env`):

**File name:** `.env` or `groq.env`  

**Contents (one line, exact format):**

```env
GROQ_API_KEY=gsk_your_key_here
```

**Wrong (common mistakes):**

```env
GROQ_API_KEY = gsk_...        # spaces around = — variable may not load
GROQ_API_KEY="gsk_..."        # quotes can end up inside the key → Groq 401
```

After fixing `.env`, **`docker rm` + `docker run ... --env-file`** again, then verify:

`docker exec mynodered printenv GROQ_API_KEY`

The printed value must be **only** the key characters (no surrounding `"` ).

Optional lines (same file):

```env
GROQ_MODEL=openai/gpt-oss-20b
GROQ_MODEL_HIGH_QUALITY=openai/gpt-oss-120b
```

See also `node-red.env.example` in the Dashboard repo for variable names.

## 2. Recreate the container when adding or changing env

`docker start` does **not** apply new variables. You must **remove and create** the container again with the same **image**, **ports**, and **volume**, plus `--env-file` or `-e`.

Example — adjust paths to match your PC:

```powershell
docker stop mynodered
docker rm mynodered

docker run -d `
  --name mynodered `
  -p 1880:1880 `
  -v "E:\Wireless Project\Smart Classroom\node-red\data:/data" `
  --env-file "E:\Wireless Project\Smart Classroom\.env" `
  nodered/node-red
```

Verify inside the container:

```powershell
docker exec mynodered printenv GROQ_API_KEY
```

## 3. Flows in this repo vs flows on disk

- **Live** flows are usually `...\Smart Classroom\node-red\data\flows.json` (survives container recreate).  
- **`all_flows_edit.json`** in the Dashboard repo is an **export** for backup / course hand-in. After edits, **Import → Deploy** in the editor (as you did).

## 4. Phase C quick test

With Node-RED up and `npm run dev:all` (storage bridge + Vite):

1. Open the React dashboard → **Generate AI Report**.  
2. Or from PowerShell (use `curl.exe`, not `curl`):

```powershell
curl.exe -s -X POST http://127.0.0.1:1880/api/ai-report -H "Content-Type: application/json" -d "{}" --max-time 120
```

Expect JSON with `summary`, `generatedAt`, `model`, and `source` (`groq` when the key works, `local` for fallback).

If requests used to **time out (~75s)** but Node-RED and the key are fine, the flow now calls Groq **`/v1/chat/completions`** (stable) instead of **`/v1/responses`** (often stalled from Docker). Re-import the latest `all_flows_edit.json` and Deploy.

The **API AI Groq native https** function uses Node’s **`https`** module with a **26s socket timeout** and **`await`**, so the HTTP response to your dashboard is sent as soon as Groq answers or times out (Node-RED’s generic *http request* node was still hitting ~120s defaults in some setups).

**Function nodes cannot use `process.env`.** Per [Node-RED environment variables](https://nodered.org/docs/user-guide/environment-variables), the flow uses **`env.get("GROQ_API_KEY")`** (and the same for `GROQ_MODEL` / `GROQ_MODEL_HIGH_QUALITY`). That still resolves to the variables you pass into Docker (`-e` / `--env-file`).

### `functionExternalModules` (if Deploy fails on the Groq function)

That function lists **`https`** under **Modules** in the editor. If deploy errors with *external modules not allowed*, edit **`node-red/data/settings.js`** inside your Node-RED user dir and ensure:

`functionExternalModules: true`

Restart the container, then Deploy again.

## 5. Storage bridge from Node-RED in Docker

Keep **POST storage bridge** and **POST downtime tick** pointing at `http://host.docker.internal:4050/...` while the bridge runs on the host with `npm run dev:all`, unless you change that architecture.

## 6. MQTT vs Groq API key (privacy)

- **`GROQ_API_KEY`** exists only as a **Docker / host environment variable** inside the Node-RED process. It is used only in the **HTTP Request** node to **https://api.groq.com** (TLS). It is **not** written into `flows.json`, **not** sent to the public MQTT broker, and **not** exposed to the browser.
- **MQTT** in this project: telemetry is received on `smartclass/demo01/telemetry`; **mqtt out** publishes only to **`smartclass/demo01/command`** with classroom command JSON (mode, light, fan, `forceOff`, etc.) from existing logic — same as before Phase C. No AI secrets are attached to MQTT payloads.

## 7. If “Generate AI Report” hung forever (fixed in current `all_flows_edit.json`)

The outbound Groq **http request** node clears `msg.req`. The flow must keep a copy (`_aiHttpReq`) so **http response** can still close the browser request. Re-import the latest **`all_flows_edit.json`** from this repo and **Deploy**.

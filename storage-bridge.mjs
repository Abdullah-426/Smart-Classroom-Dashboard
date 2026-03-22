/**
 * Local persistence for dashboard telemetry + derived occupancy sessions.
 * Run: npm run storage / npm run dev:all (binds 0.0.0.0 by default for Docker → host).
 * Node-RED in Docker: POST http://host.docker.internal:<port>/ingest (see all_flows_edit.json).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.STORAGE_BRIDGE_PORT || 4050);
/** Use `0.0.0.0` if Node-RED in Docker cannot reach the bridge via host.docker.internal (dev only). */
const HOST = process.env.STORAGE_BRIDGE_HOST || "127.0.0.1";
const DATA_DIR = path.join(__dirname, "data");
const TELEMETRY_FILE = path.join(DATA_DIR, "telemetry.jsonl");
const SESSIONS_FILE = path.join(DATA_DIR, "occupancy-sessions.json");
const STATE_FILE = path.join(DATA_DIR, "bridge-state.json");
const DOWNTIME_FILE = path.join(DATA_DIR, "downtime.json");

/** Since this process started (helps diagnose “bridge reachable” but Node-RED never hits /ingest). */
let bridgeIngestCount = 0;
let bridgeLastIngestMs = null;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonSafe(file, fallback) {
  try {
    const t = fs.readFileSync(file, "utf8");
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function loadState() {
  const s = readJsonSafe(STATE_FILE, {});
  return {
    lastOccupied: Boolean(s.lastOccupied),
    openStart: typeof s.openStart === "number" ? s.openStart : null,
    nextSessionNumber: Number.isFinite(s.nextSessionNumber) ? s.nextSessionNumber : 1,
  };
}

function saveState(state) {
  writeJsonAtomic(STATE_FILE, state);
}

/** Same identity as frontend `occupancySessionKey` (merge + flag PATCH). */
function occupancySessionKey(s) {
  return `${s.startedAtIso ?? ""}|${s.endedAtIso ?? ""}|${String(s.durationText ?? "")}`;
}

function normalizeSessionRow(s) {
  if (!s || typeof s !== "object") return null;
  return {
    sessionNumber: typeof s.sessionNumber === "number" ? s.sessionNumber : null,
    durationText: String(s.durationText ?? ""),
    durationMinutes: typeof s.durationMinutes === "number" ? s.durationMinutes : undefined,
    durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : undefined,
    startedAtIso: typeof s.startedAtIso === "string" ? s.startedAtIso : null,
    endedAtIso: typeof s.endedAtIso === "string" ? s.endedAtIso : null,
    legacy: Boolean(s.legacy),
    flagged: Boolean(s.flagged),
  };
}

function loadSessions() {
  const arr = readJsonSafe(SESSIONS_FILE, []);
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeSessionRow).filter(Boolean);
}

function saveSessions(list) {
  writeJsonAtomic(SESSIONS_FILE, list);
}

function appendTelemetryLine(obj) {
  ensureDir();
  fs.appendFileSync(TELEMETRY_FILE, `${JSON.stringify(obj)}\n`, "utf8");
}

function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return { text: `${m} min ${s} sec`, minutes: m, seconds: totalSec };
}

function loadDowntimeState() {
  const s = readJsonSafe(DOWNTIME_FILE, {});
  return {
    totalDowntimeMs: Number.isFinite(s.totalDowntimeMs) ? Math.max(0, s.totalDowntimeMs) : 0,
    offSinceMs: typeof s.offSinceMs === "number" && s.offSinceMs > 0 ? s.offSinceMs : null,
  };
}

function saveDowntimeState(st) {
  writeJsonAtomic(DOWNTIME_FILE, st);
}

/** Credit downtime accrued while the bridge process was stopped (off segment was open). */
function normalizeDowntimeAfterBridgeStart() {
  ensureDir();
  const now = Date.now();
  const st = loadDowntimeState();
  if (st.offSinceMs != null) {
    st.totalDowntimeMs += Math.max(0, now - st.offSinceMs);
    st.offSinceMs = null;
    saveDowntimeState(st);
  }
}

function downtimeDisplayMsAt(now = Date.now()) {
  const st = loadDowntimeState();
  let display = st.totalDowntimeMs;
  if (st.offSinceMs != null) display += Math.max(0, now - st.offSinceMs);
  return display;
}

function downtimeTick(isLive) {
  const now = Date.now();
  const st = loadDowntimeState();
  if (!isLive) {
    if (st.offSinceMs == null) st.offSinceMs = now;
  } else if (st.offSinceMs != null) {
    st.totalDowntimeMs += Math.max(0, now - st.offSinceMs);
    st.offSinceMs = null;
  }
  saveDowntimeState(st);
  return {
    ok: true,
    totalDowntimeMs: st.totalDowntimeMs,
    displayDowntimeMs: downtimeDisplayMsAt(now),
    offSinceMs: st.offSinceMs,
  };
}

function downtimeReset() {
  const now = Date.now();
  const st = loadDowntimeState();
  const stillOff = st.offSinceMs != null;
  const next = {
    totalDowntimeMs: 0,
    offSinceMs: stillOff ? now : null,
  };
  saveDowntimeState(next);
  return { ok: true, totalDowntimeMs: 0, offSinceMs: next.offSinceMs, displayDowntimeMs: 0 };
}

function processIngest(body) {
  const pipelineLive = body.pipelineLive !== false;
  if (!pipelineLive) {
    return { ok: true, skipped: true, reason: "pipeline_not_live" };
  }

  const receivedAt = typeof body.receivedAt === "number" ? body.receivedAt : Date.now();
  const occupied = Boolean(body.occupied);
  const line = {
    receivedAt,
    temperature: typeof body.temperature === "number" ? body.temperature : null,
    motion: Boolean(body.motion),
    occupied,
    light: body.light ? 1 : 0,
    fan: body.fan ? 1 : 0,
    mode: body.mode || "auto",
    tempThreshold: typeof body.tempThreshold === "number" ? body.tempThreshold : 28,
  };
  appendTelemetryLine(line);
  bridgeIngestCount += 1;
  bridgeLastIngestMs = Date.now();
  if (process.env.STORAGE_BRIDGE_LOG_INGEST === "1") {
    console.log("[storage-bridge] ingest", line.receivedAt, line.temperature, line.occupied);
  }

  let state = loadState();
  const sessions = loadSessions();

  if (occupied && !state.lastOccupied) {
    state.openStart = receivedAt;
  }
  if (!occupied && state.lastOccupied && state.openStart != null) {
    const dur = receivedAt - state.openStart;
    const { text, minutes, seconds } = formatDurationMs(dur);
    const startedAtIso = new Date(state.openStart).toISOString();
    const endedAtIso = new Date(receivedAt).toISOString();
    sessions.unshift({
      sessionNumber: state.nextSessionNumber,
      durationText: text,
      durationMinutes: minutes,
      durationSeconds: seconds,
      startedAtIso,
      endedAtIso,
      legacy: false,
      flagged: false,
    });
    state.nextSessionNumber += 1;
    state.openStart = null;
    saveSessions(sessions);
  }

  state.lastOccupied = occupied;
  saveState(state);
  return { ok: true };
}

/** In-progress session row for dashboard (bridge state). */
function currentOccupancyFromState(state) {
  if (!state.lastOccupied || state.openStart == null) return null;
  const dur = Date.now() - state.openStart;
  const { text } = formatDurationMs(dur);
  return {
    active: true,
    sessionNumber: state.nextSessionNumber,
    startedAtIso: new Date(state.openStart).toISOString(),
    durationSoFarText: text,
  };
}

function patchOccupancySessionFlag(sessionKey, flagged) {
  if (typeof sessionKey !== "string" || !sessionKey.trim()) {
    return { ok: false, error: "sessionKey required" };
  }
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => occupancySessionKey(s) === sessionKey);
  if (idx < 0) {
    return { ok: false, error: "session_not_found" };
  }
  const next = sessions.slice();
  next[idx] = { ...next[idx], flagged: Boolean(flagged) };
  saveSessions(next);
  return { ok: true, sessionKey, flagged: Boolean(flagged) };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw.trim()) return resolve({});
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function countLinesFile(file) {
  try {
    const st = fs.statSync(file);
    if (st.size === 0) return { bytes: 0, lines: 0 };
    const buf = fs.readFileSync(file, "utf8");
    const lines = buf.trim() ? buf.trim().split("\n").length : 0;
    return { bytes: st.size, lines };
  } catch {
    return { bytes: 0, lines: 0 };
  }
}

function tailJsonlTemperature(limit) {
  ensureDir();
  if (!fs.existsSync(TELEMETRY_FILE)) return [];
  const buf = fs.readFileSync(TELEMETRY_FILE, "utf8");
  const rows = buf
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((ln) => {
      try {
        return JSON.parse(ln);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const slice = rows.slice(-Math.max(1, limit));
  let prevAt = 0;
  return slice.map((r) => {
    let atMs = typeof r.receivedAt === "number" && Number.isFinite(r.receivedAt) ? r.receivedAt : Date.now();
    if (atMs <= prevAt) atMs = prevAt + 1;
    prevAt = atMs;
    return {
      time: new Date(r.receivedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      atMs,
      temperature: typeof r.temperature === "number" ? r.temperature : 0,
    };
  });
}

function storageInfo() {
  ensureDir();
  const tel = countLinesFile(TELEMETRY_FILE);
  const sessions = loadSessions();
  let oldest = null;
  let newest = null;
  if (tel.lines > 0 && fs.existsSync(TELEMETRY_FILE)) {
    const first = fs.readFileSync(TELEMETRY_FILE, "utf8").split("\n").find(Boolean);
    const last = fs.readFileSync(TELEMETRY_FILE, "utf8").trim().split("\n").filter(Boolean).pop();
    try {
      oldest = first ? new Date(JSON.parse(first).receivedAt).toISOString() : null;
    } catch {
      oldest = null;
    }
    try {
      newest = last ? new Date(JSON.parse(last).receivedAt).toISOString() : null;
    } catch {
      newest = null;
    }
  }
  const dState = loadDowntimeState();
  const now = Date.now();
  return {
    ok: true,
    dataDirectory: DATA_DIR,
    telemetryFileBytes: tel.bytes,
    telemetrySampleCount: tel.lines,
    occupancySessionCount: sessions.length,
    oldestSampleIso: oldest,
    newestSampleIso: newest,
    bridgeIngestSinceStart: bridgeIngestCount,
    bridgeLastIngestIso: bridgeLastIngestMs ? new Date(bridgeLastIngestMs).toISOString() : null,
    downtimeTotalMs: dState.totalDowntimeMs,
    downtimeDisplayMs: downtimeDisplayMsAt(now),
    downtimeOffSinceMs: dState.offSinceMs,
  };
}

function clearStorage() {
  ensureDir();
  for (const f of [TELEMETRY_FILE, SESSIONS_FILE, STATE_FILE]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
  saveState({ lastOccupied: false, openStart: null, nextSessionNumber: 1 });
  saveSessions([]);
  bridgeIngestCount = 0;
  bridgeLastIngestMs = null;
  return { ok: true, cleared: true };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "POST" && url.pathname === "/ingest") {
      const body = await readBody(req);
      const out = processIngest(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/storage/downtime/tick") {
      const body = await readBody(req);
      const isLive = Boolean(body.isLive);
      const out = downtimeTick(isLive);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/storage/downtime/reset") {
      downtimeReset();
      const now = Date.now();
      const out = {
        ok: true,
        totalDowntimeMs: loadDowntimeState().totalDowntimeMs,
        displayDowntimeMs: downtimeDisplayMsAt(now),
        offSinceMs: loadDowntimeState().offSinceMs,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/info") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(storageInfo()));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/temperature-trend") {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
      const trend = tailJsonlTemperature(limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, trend }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/occupancy-sessions") {
      const state = loadState();
      const currentSession = currentOccupancyFromState(state);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          sessions: loadSessions(),
          currentSession,
        }),
      );
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/storage/occupancy-sessions/flag") {
      const body = await readBody(req);
      const out = patchOccupancySessionFlag(body.sessionKey, body.flagged);
      res.writeHead(out.ok ? 200 : out.error === "session_not_found" ? 404 : 400, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/storage/clear") {
      const out = clearStorage();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
});

ensureDir();
normalizeDowntimeAfterBridgeStart();
server.listen(PORT, HOST, () => {
  const loopHint = HOST === "0.0.0.0" ? "all interfaces" : HOST;
  console.log(`[storage-bridge] listening on http://${loopHint}:${PORT}`);
  console.log(`[storage-bridge] data dir: ${DATA_DIR}`);
  console.log(`[storage-bridge] POST JSON telemetry to http://127.0.0.1:${PORT}/ingest (Node-RED on same machine).`);
  console.log(
    `[storage-bridge] Docker: URL http://host.docker.internal:${PORT}/ingest — if POSTs fail, try STORAGE_BRIDGE_HOST=0.0.0.0`,
  );
  console.log(`[storage-bridge] Verbose ingest logs: set STORAGE_BRIDGE_LOG_INGEST=1`);
});

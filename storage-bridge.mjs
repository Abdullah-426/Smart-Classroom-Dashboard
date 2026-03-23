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
const ATTENDANCE_EVENTS_FILE = path.join(DATA_DIR, "attendance-events.jsonl");
const ATTENDANCE_STATE_FILE = path.join(DATA_DIR, "attendance-bridge-state.json");
const ATTENDANCE_SESSION_FILE = path.join(DATA_DIR, "attendance-session.json");
const ATTENDANCE_SCAN_LOG_FILE = path.join(DATA_DIR, "attendance-scan-log.jsonl");

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
    forceOff: Boolean(body.forceOff),
    afterHoursAlert: Boolean(body.afterHoursAlert),
    tempThreshold: typeof body.tempThreshold === "number" ? body.tempThreshold : 28,

    // Phase 1+ richer device telemetry (kept for historical analysis/backfill)
    lightOnCount:
      typeof body.lightOnCount === "number" && Number.isFinite(body.lightOnCount)
        ? body.lightOnCount
        : body.light
          ? 10
          : 0,
    lightTotal:
      typeof body.lightTotal === "number" && Number.isFinite(body.lightTotal)
        ? body.lightTotal
        : 10,
    lightsMask:
      typeof body.lightsMask === "number" && Number.isFinite(body.lightsMask)
        ? body.lightsMask
        : null,
    fanOnCount:
      typeof body.fanOnCount === "number" && Number.isFinite(body.fanOnCount)
        ? body.fanOnCount
        : body.fan
          ? 6
          : 0,
    fanTotal:
      typeof body.fanTotal === "number" && Number.isFinite(body.fanTotal)
        ? body.fanTotal
        : 6,
    fansMask:
      typeof body.fansMask === "number" && Number.isFinite(body.fansMask)
        ? body.fansMask
        : null,
    acPower: typeof body.acPower === "boolean" ? body.acPower : null,
    acMode: typeof body.acMode === "string" ? body.acMode : null,
    acSetpoint:
      typeof body.acSetpoint === "number" && Number.isFinite(body.acSetpoint)
        ? body.acSetpoint
        : null,
    acCoolingActive:
      typeof body.acCoolingActive === "boolean" ? body.acCoolingActive : null,
    acManualOverride:
      typeof body.acManualOverride === "boolean" ? body.acManualOverride : null,
  };
  appendTelemetryLine(line);
  bridgeIngestCount += 1;
  bridgeLastIngestMs = Date.now();
  if (process.env.STORAGE_BRIDGE_LOG_INGEST === "1") {
    console.log("[storage-bridge] ingest", line.receivedAt, line.temperature, line.occupied);
  }

  // Optional attendance event ingest (from Wokwi telemetry)
  const attendanceEv = normalizeAttendanceEvent(body.attendanceEvent);
  if (attendanceEv) {
    appendAttendanceEventRow({
      receivedAt,
      tagId: attendanceEv.tagId,
      eventType: attendanceEv.eventType,
    });
    processAttendanceEvent(attendanceEv, receivedAt);
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

function parseTelemetryRows() {
  ensureDir();
  if (!fs.existsSync(TELEMETRY_FILE)) return [];
  const buf = fs.readFileSync(TELEMETRY_FILE, "utf8");
  return buf
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
}

/** Uniform subsample so very large windows stay bounded. */
function subsampleRows(rows, maxPoints) {
  if (rows.length <= maxPoints) return rows;
  const n = rows.length;
  if (maxPoints <= 1) return [rows[n - 1]];
  const out = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * (n - 1)) / (maxPoints - 1));
    out.push(rows[Math.min(idx, n - 1)]);
  }
  return out;
}

function rowsToTrendPoints(rows) {
  let prevAt = 0;
  return rows.map((r) => {
    let atMs = typeof r.receivedAt === "number" && Number.isFinite(r.receivedAt) ? r.receivedAt : prevAt + 1;
    if (atMs <= prevAt) atMs = prevAt + 1;
    prevAt = atMs;
    const t = r.temperature;
    const temperature = typeof t === "number" && Number.isFinite(t) ? t : null;
    return {
      time: new Date(atMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      atMs,
      temperature,
    };
  });
}

function tailJsonlTemperature(limit) {
  const rows = parseTelemetryRows();
  const slice = rows.slice(-Math.max(1, limit));
  return rowsToTrendPoints(slice);
}

/** All samples with receivedAt >= sinceMs, oldest-first, capped by maxPoints (subsampled if needed). */
function temperatureTrendSince(sinceMs, maxPoints) {
  const since = typeof sinceMs === "number" && Number.isFinite(sinceMs) ? sinceMs : 0;
  const rows = parseTelemetryRows()
    .filter((r) => typeof r.receivedAt === "number" && r.receivedAt >= since)
    .sort((a, b) => a.receivedAt - b.receivedAt);
  const capped = subsampleRows(rows, Math.max(1, maxPoints));
  return rowsToTrendPoints(capped);
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
  for (const f of [
    TELEMETRY_FILE,
    SESSIONS_FILE,
    STATE_FILE,
    ATTENDANCE_EVENTS_FILE,
    ATTENDANCE_STATE_FILE,
    ATTENDANCE_SCAN_LOG_FILE,
    ATTENDANCE_SESSION_FILE,
  ]) {
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

function loadAttendanceBridgeState() {
  const s = readJsonSafe(ATTENDANCE_STATE_FILE, {});
  return {
    lastScanAtByTag:
      s.lastScanAtByTag && typeof s.lastScanAtByTag === "object" ? s.lastScanAtByTag : {},
    lastAcceptedAtByStudentId:
      s.lastAcceptedAtByStudentId && typeof s.lastAcceptedAtByStudentId === "object"
        ? s.lastAcceptedAtByStudentId
        : {},
  };
}

function saveAttendanceBridgeState(st) {
  writeJsonAtomic(ATTENDANCE_STATE_FILE, st);
}

function normalizeAttendanceEvent(ev) {
  if (!ev || typeof ev !== "object") return null;
  const tagIdRaw = ev.tagId;
  const tagId = typeof tagIdRaw === "string" ? tagIdRaw.trim() : "";
  if (!tagId) return null;
  const eventType = typeof ev.eventType === "string" ? ev.eventType : "present";
  return { tagId: tagId.toUpperCase(), eventType };
}

function appendAttendanceEventRow(row) {
  ensureDir();
  fs.appendFileSync(ATTENDANCE_EVENTS_FILE, `${JSON.stringify(row)}\n`, "utf8");
}

function appendAttendanceScanLogRow(row) {
  ensureDir();
  fs.appendFileSync(ATTENDANCE_SCAN_LOG_FILE, `${JSON.stringify(row)}\n`, "utf8");
}

function parseAttendanceEvents() {
  ensureDir();
  if (!fs.existsSync(ATTENDANCE_EVENTS_FILE)) return [];
  const buf = fs.readFileSync(ATTENDANCE_EVENTS_FILE, "utf8");
  if (!buf.trim()) return [];
  return buf
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
}

function parseAttendanceScanLog() {
  ensureDir();
  if (!fs.existsSync(ATTENDANCE_SCAN_LOG_FILE)) return [];
  const buf = fs.readFileSync(ATTENDANCE_SCAN_LOG_FILE, "utf8");
  if (!buf.trim()) return [];
  return buf
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
}

const DEFAULT_ATTENDANCE_ROSTER = [
  { studentId: "SC-001", name: "Aanya Rao", tagId: "01:02:03:04", section: "CSE-A" }, // Blue Card
  { studentId: "SC-002", name: "Mohammed Ali", tagId: "11:22:33:44", section: "CSE-A" }, // Green Card
  { studentId: "SC-003", name: "Riya Patel", tagId: "55:66:77:88", section: "CSE-A" }, // Yellow Card
  { studentId: "SC-004", name: "Daniel James", tagId: "AA:BB:CC:DD", section: "CSE-A" }, // Red Card
  { studentId: "SC-005", name: "Sara Khan", tagId: "04:11:22:33", section: "CSE-A" }, // NFC Tag (Wokwi 4-byte UID)
  { studentId: "SC-006", name: "Vikram Nair", tagId: "C0:FF:EE:99", section: "CSE-A" }, // Key Fob
];

function normalizedRoster() {
  return DEFAULT_ATTENDANCE_ROSTER.map((s) => ({
    ...s,
    tagId: String(s.tagId || "").trim().toUpperCase(),
  }));
}

function loadAttendanceSession() {
  const s = readJsonSafe(ATTENDANCE_SESSION_FILE, {});
  return {
    active: Boolean(s.active),
    sessionId: typeof s.sessionId === "string" ? s.sessionId : null,
    className: typeof s.className === "string" ? s.className : "Smart Classroom Demo",
    courseName: typeof s.courseName === "string" ? s.courseName : "IoT Systems Lab",
    section: typeof s.section === "string" ? s.section : "CSE-A",
    startedAtMs: typeof s.startedAtMs === "number" ? s.startedAtMs : null,
    endedAtMs: typeof s.endedAtMs === "number" ? s.endedAtMs : null,
    lateAfterMs: typeof s.lateAfterMs === "number" ? s.lateAfterMs : null,
    duplicateSuppressMs:
      typeof s.duplicateSuppressMs === "number" && s.duplicateSuppressMs > 0 ? s.duplicateSuppressMs : 5000,
    absenceTimeoutMs:
      typeof s.absenceTimeoutMs === "number" && s.absenceTimeoutMs > 0 ? s.absenceTimeoutMs : 60_000,
  };
}

function saveAttendanceSession(s) {
  writeJsonAtomic(ATTENDANCE_SESSION_FILE, s);
}

function startAttendanceSession(body = {}) {
  const now = Date.now();
  const duplicateSuppressMs = Number.isFinite(body.duplicateSuppressMs)
    ? Math.max(500, Number(body.duplicateSuppressMs))
    : 5000;
  const absenceTimeoutMs = Number.isFinite(body.absenceTimeoutMs)
    ? Math.max(10_000, Number(body.absenceTimeoutMs))
    : 60_000;
  const lateAfterMinutes = Number.isFinite(body.lateAfterMinutes)
    ? Math.max(0, Number(body.lateAfterMinutes))
    : 10;
  const session = {
    active: true,
    sessionId: `session-${now}`,
    className:
      typeof body.className === "string" && body.className.trim()
        ? body.className.trim()
        : "Smart Classroom Demo",
    courseName:
      typeof body.courseName === "string" && body.courseName.trim()
        ? body.courseName.trim()
        : "IoT Systems Lab",
    section:
      typeof body.section === "string" && body.section.trim() ? body.section.trim() : "CSE-A",
    startedAtMs: now,
    endedAtMs: null,
    lateAfterMs: now + lateAfterMinutes * 60 * 1000,
    duplicateSuppressMs,
    absenceTimeoutMs,
  };
  saveAttendanceSession(session);
  saveAttendanceBridgeState({
    lastScanAtByTag: {},
    lastAcceptedAtByStudentId: {},
  });
  return { ok: true, session };
}

function endAttendanceSession() {
  const s = loadAttendanceSession();
  if (!s.active) return { ok: true, session: s };
  const next = { ...s, active: false, endedAtMs: Date.now() };
  saveAttendanceSession(next);
  return { ok: true, session: next };
}

function clearAttendanceStorage() {
  for (const f of [ATTENDANCE_EVENTS_FILE, ATTENDANCE_STATE_FILE, ATTENDANCE_SCAN_LOG_FILE]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}

function processAttendanceEvent(ev, receivedAtMs) {
  const roster = normalizedRoster();
  const byTag = new Map(roster.map((s) => [s.tagId, s]));
  const session = loadAttendanceSession();
  const st = loadAttendanceBridgeState();
  const tagId = ev.tagId;
  const student = byTag.get(tagId);

  let status = "present";
  let reason = "";
  let late = false;

  if (!session.active || !session.startedAtMs) {
    status = "invalid";
    reason = "session_inactive";
  } else if (!student) {
    status = "invalid";
    reason = "unknown_card";
  } else {
    const lastAt = st.lastScanAtByTag[tagId];
    if (typeof lastAt === "number" && receivedAtMs - lastAt < session.duplicateSuppressMs) {
      status = "duplicate";
      reason = "rapid_rescan";
    } else {
      late = receivedAtMs >= (session.lateAfterMs || session.startedAtMs + 10 * 60 * 1000);
      status = late ? "late" : "present";
      reason = late ? "late_threshold_exceeded" : "accepted";
      st.lastAcceptedAtByStudentId[student.studentId] = receivedAtMs;
    }
  }

  st.lastScanAtByTag[tagId] = receivedAtMs;
  saveAttendanceBridgeState(st);

  const scanRow = {
    receivedAt: receivedAtMs,
    tagId,
    eventType: ev.eventType || "present",
    sessionId: session.sessionId,
    status,
    reason,
    late,
    studentId: student?.studentId ?? null,
    studentName: student?.name ?? null,
    section: student?.section ?? null,
  };
  appendAttendanceScanLogRow(scanRow);
  return scanRow;
}

function attendanceLiveNow() {
  const nowMs = Date.now();
  const roster = normalizedRoster();
  const byStudentId = new Map(roster.map((s) => [s.studentId, s]));
  const session = loadAttendanceSession();
  const scans = parseAttendanceScanLog();
  const inSession = scans
    .filter((r) => {
      if (typeof r.receivedAt !== "number") return false;
      if (!session.sessionId) return true;
      return r.sessionId === session.sessionId;
    })
    .sort((a, b) => a.receivedAt - b.receivedAt);

  const studentAgg = new Map();
  let invalidCount = 0;
  let duplicateCount = 0;
  for (const row of inSession) {
    if (row.status === "invalid") invalidCount += 1;
    if (row.status === "duplicate") duplicateCount += 1;
    if (!row.studentId) continue;
    let agg = studentAgg.get(row.studentId);
    if (!agg) {
      agg = {
        studentId: row.studentId,
        firstSeenAtMs: row.receivedAt,
        lastSeenAtMs: row.receivedAt,
        scanCount: 1,
        late: row.status === "late",
      };
      studentAgg.set(row.studentId, agg);
    } else {
      agg.lastSeenAtMs = Math.max(agg.lastSeenAtMs, row.receivedAt);
      agg.scanCount += 1;
      agg.late = agg.late || row.status === "late";
    }
  }

  const students = roster.map((s) => {
    const agg = studentAgg.get(s.studentId);
    const state = !agg ? "absent" : agg.late ? "late" : "present";
    return {
      studentId: s.studentId,
      name: s.name,
      section: s.section,
      tagId: s.tagId,
      state,
      firstSeenAtIso: agg ? new Date(agg.firstSeenAtMs).toISOString() : null,
      lastSeenAtIso: agg ? new Date(agg.lastSeenAtMs).toISOString() : null,
      scanCount: agg ? agg.scanCount : 0,
      attendancePercent: agg ? 100 : 0,
    };
  });

  const presentCount = students.filter((s) => s.state === "present").length;
  const lateCount = students.filter((s) => s.state === "late").length;
  const absentCount = students.filter((s) => s.state === "absent").length;

  const recentScans = inSession
    .slice(-50)
    .reverse()
    .map((r) => ({
      receivedAtIso: new Date(r.receivedAt).toISOString(),
      tagId: r.tagId,
      status: r.status,
      reason: r.reason,
      studentId: r.studentId,
      studentName: r.studentName,
    }));

  return {
    ok: true,
    className: session.className,
    courseName: session.courseName,
    section: session.section,
    session: {
      sessionId: session.sessionId,
      active: session.active,
      startedAtMs: session.startedAtMs,
      endedAtMs: session.endedAtMs,
      lateAfterMs: session.lateAfterMs,
      duplicateSuppressMs: session.duplicateSuppressMs,
      absenceTimeoutMs: session.absenceTimeoutMs,
      nowMs,
    },
    stats: {
      rosterCount: roster.length,
      presentCount,
      lateCount,
      absentCount,
      invalidCount,
      duplicateCount,
      attendancePercent:
        roster.length > 0 ? Math.round(((presentCount + lateCount) / roster.length) * 1000) / 10 : 0,
    },
    students,
    recentScans,
  };
}

function attendanceSummaryNow() {
  const live = attendanceLiveNow();
  const tags = live.students.map((s) => ({
    tagId: s.tagId,
    firstSeenAtIso: s.firstSeenAtIso || new Date(0).toISOString(),
    lastSeenAtIso: s.lastSeenAtIso || new Date(0).toISOString(),
    eventCount: s.scanCount,
    late: s.state === "late",
    present: s.state === "present",
    endedAtIso: s.state === "absent" ? (s.lastSeenAtIso || null) : null,
  }));
  return {
    ok: true,
    session: {
      sessionStartMs: live.session.startedAtMs || Date.now(),
      sessionEndMs: live.session.endedAtMs || Date.now(),
      lateAfterMs: live.session.lateAfterMs || Date.now(),
      absenceTimeoutMs: live.session.absenceTimeoutMs,
    },
    presentCount: live.stats.presentCount + live.stats.lateCount,
    tags,
  };
}

function scheduleWindowMsFromNow(nowMs, timeZone) {
  // Window: [08:00, 18:00) in classroom time.
  // For this bridge, we keep a pragmatic implementation (good enough for consistent forceOff schedule behavior).
  const now = new Date(nowMs);
  const tz = typeof timeZone === "string" ? timeZone.trim() : "";

  // If tz is missing, use local time directly.
  if (!tz) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0).getTime();
    return { sessionStartMs: start, sessionEndMs: end };
  }

  // For tz mode: derive Y-M-D by formatting in tz, then construct a UTC timestamp for the desired wall time.
  // This is consistent enough for attendance UI; Node-RED is the source of truth for forceOff.
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const pick = (t) => parts.find((x) => x.type === t)?.value;
  const year = Number(pick("year") || 1970);
  const month = Number((pick("month") || "01")) - 1;
  const day = Number(pick("day") || "1");
  const sessionStartMs = new Date(Date.UTC(year, month, day, 8, 0, 0)).getTime();
  const sessionEndMs = new Date(Date.UTC(year, month, day, 18, 0, 0)).getTime();
  return { sessionStartMs, sessionEndMs };
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
      const maxCap = 20_000;
      const sinceRaw = url.searchParams.get("sinceMs");
      let trend;
      if (sinceRaw != null && sinceRaw !== "") {
        const sinceMs = Number(sinceRaw);
        const limit = Math.min(maxCap, Math.max(1, Number(url.searchParams.get("limit")) || 5000));
        trend = Number.isFinite(sinceMs) ? temperatureTrendSince(sinceMs, limit) : [];
      } else {
        const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
        trend = tailJsonlTemperature(limit);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, trend }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/storage/attendance/reset") {
      clearAttendanceStorage();
      saveAttendanceSession({
        active: false,
        sessionId: null,
        className: "Smart Classroom Demo",
        courseName: "IoT Systems Lab",
        section: "CSE-A",
        startedAtMs: null,
        endedAtMs: null,
        lateAfterMs: null,
        duplicateSuppressMs: 5000,
        absenceTimeoutMs: 60_000,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/storage/attendance/session/start") {
      const body = await readBody(req);
      const out = startAttendanceSession(body || {});
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/storage/attendance/session/end") {
      const out = endAttendanceSession();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/attendance/live") {
      const out = attendanceLiveNow();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/attendance/roster") {
      const roster = normalizedRoster();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, roster }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/attendance/export.csv") {
      const live = attendanceLiveNow();
      const rows = [
        "studentId,name,section,tagId,state,firstSeenAtIso,lastSeenAtIso,scanCount,attendancePercent",
        ...live.students.map((s) =>
          [
            s.studentId,
            `"${String(s.name).replace(/"/g, '""')}"`,
            s.section,
            s.tagId,
            s.state,
            s.firstSeenAtIso || "",
            s.lastSeenAtIso || "",
            String(s.scanCount),
            String(s.attendancePercent),
          ].join(","),
        ),
      ];
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-${live.session.sessionId || "session"}.csv"`,
      });
      res.end(rows.join("\n"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/attendance-summary") {
      const out = attendanceSummaryNow();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/storage/attendance-events") {
      const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit")) || 200));
      const sinceRaw = url.searchParams.get("sinceMs");
      const sinceMs = sinceRaw != null && sinceRaw !== "" && Number.isFinite(Number(sinceRaw)) ? Number(sinceRaw) : 0;
      const rows = parseAttendanceEvents()
        .filter((r) => typeof r.receivedAt === "number" && r.receivedAt >= sinceMs)
        .sort((a, b) => b.receivedAt - a.receivedAt)
        .slice(0, limit);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, events: rows }));
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

import fs from "node:fs";

const flowPath = "E:/Wireless Project/Smart Classroom Dashboard/all_flows_edit.json";

function buildNewStateObjectCode() {
  // NOTE: This code string is inserted into the Node-RED Function node's `func`.
  return `const state = {
    temperature: num(tel.temperature, null),
    motion: !!tel.motion,
    occupied: !!tel.occupied,

    // Backward-compatible binary control flags
    light: tel.light ? 1 : 0,
    fan: tel.fan ? 1 : 0,
    mode: tel.mode || "unknown",
    forceOff: !!tel.forceOff,
    afterHoursAlert: !!tel.afterHoursAlert,
    tempThreshold: num(tel.tempThreshold, 28),

    // Phase 1+: expanded device state (if present in telemetry)
    lightOnCount: num(tel.lightOnCount, null),
    lightTotal: num(tel.lightTotal, null),
    lightsMask: typeof tel.lightsMask === "number" ? tel.lightsMask : null,

    fanOnCount: num(tel.fanOnCount, null),
    fanTotal: num(tel.fanTotal, null),
    fansMask: typeof tel.fansMask === "number" ? tel.fansMask : null,

    // Phase 1+: AC state (if present in telemetry)
    acPower: typeof tel.acPower === "boolean" ? tel.acPower : null,
    acMode: typeof tel.acMode === "string" ? tel.acMode : null,
    acSetpoint: num(tel.acSetpoint, null),
    acCoolingActive: typeof tel.acCoolingActive === "boolean" ? tel.acCoolingActive : null,
    acManualOverride: typeof tel.acManualOverride === "boolean" ? tel.acManualOverride : null,

    roomStatus: summary.roomStatus || (tel.occupied ? "Occupied" : "Empty"),
    collegeHours: summary.collegeHours || "",
    alerts: Array.isArray(summary.alerts) ? summary.alerts : [],
    occupancyTimer: summary.occupancyTimer || "",
    estimatedEnergySaved: summary.estimatedEnergySaved || "",
    highTempWarning: summary.highTempWarning || "",

    scheduleEnabled,

    // Telemetry freshness (ms since last MQTT sample)
    pipelineAgeMs: typeof lastMqtt === "number" ? Date.now() - lastMqtt : null,

    lastWokwiMqttMs: typeof lastMqtt === "number" ? lastMqtt : null,

    // ML insight
    mlPredictedTemp: num(ml.predictedTemp, null),
    mlConfidence: num(ml.confidence, null),
    mlAnomaly: !!ml.anomaly,
    mlAssist: !!ml.assist,
    mlStatusText: typeof ml.statusText === "string" ? ml.statusText : ""
};`;
}

function buildNewSystemPromptCode() {
  return `const systemPrompt = \`You are an AI assistant for a smart classroom automation system.

Given the latest classroom telemetry, schedule policy state, expanded device counters (lights/fans),
AC state, and ML insight, produce a short pointer-style summary for the dashboard.

OUTPUT FORMAT (strict):
- Return EXACTLY 6 lines.
- Each line MUST start with "- " (dash + space).
- No extra text before/after the 6 lines.
- Each line should be concise (aim <= 90 characters).

Use these labels in order:
1) Classroom: Occupancy + control mode + lights/fans state
2) Temperature: current temp (or NA) vs threshold + comfort hint
3) AC System: power + mode + setpoint + cooling-active
4) Schedule: inside/outside schedule + after-hours motion if relevant
5) ML Insight: predicted temp + confidence + anomaly + ML status
6) Recommended action: one concrete next step

Rules / hints:
- Use lightOnCount/lightTotal when available; otherwise use binary light.
- Use fanOnCount/fanTotal when available; otherwise use binary fan.
- Use acPower/acMode/acSetpoint/acCoolingActive when present; otherwise say "AC state unavailable".
- If forceOff=true: explicitly say devices are forced OFF outside scheduled hours.
- If afterHoursAlert=true AND motion=true: mention possible after-hours intrusion/investigation.
- If temperature is null/NA: say "Temperature reading not available yet".
- If pipelineAgeMs is present and is large (> 8000ms), mention that telemetry is stale.
\`;`;
}

function buildNewBuildFallbackCode() {
  return `function buildFallback(s) {
    function fmtNum(n, digits = 1) {
        if (typeof n !== "number" || !Number.isFinite(n)) return null;
        return n.toFixed(digits);
    }

    function fmtTemp(t) {
        const v = fmtNum(t, 1);
        return v == null ? "NA" : v + "°C";
    }

    function fmtCount(onCount, totalCount, binaryOn) {
        const on = typeof onCount === "number" && Number.isFinite(onCount) ? onCount : null;
        const total = typeof totalCount === "number" && Number.isFinite(totalCount) ? totalCount : null;
        if (on != null && total != null && total > 0) return \`\${on}/\${total}\`;
        return binaryOn ? "ON" : "OFF";
    }

    const occ = s.occupied ? "Occupied" : "Empty";
    const mode = typeof s.mode === "string" && s.mode ? s.mode.toUpperCase() : "—";

    const lights = fmtCount(s.lightOnCount, s.lightTotal, s.light === 1);
    const fans = fmtCount(s.fanOnCount, s.fanTotal, s.fan === 1);

    const temp = fmtTemp(s.temperature);
    const threshold = typeof s.tempThreshold === "number" && Number.isFinite(s.tempThreshold) ? \`\${s.tempThreshold.toFixed(1)}°C\` : "—";

    let comfort = "Comfort: waiting for temperature";
    if (typeof s.temperature === "number" && Number.isFinite(s.temperature) && typeof s.tempThreshold === "number" && Number.isFinite(s.tempThreshold)) {
        const t = s.temperature;
        if (t > s.tempThreshold + 0.5) comfort = "Comfort: ABOVE threshold (cooling recommended)";
        else if (t < 18) comfort = "Comfort: room is cool (check heating if needed)";
        else comfort = "Comfort: within expected band";
    }

    const acPower = typeof s.acPower === "boolean" ? (s.acPower ? "ON" : "OFF") : "—";
    const acMode = typeof s.acMode === "string" && s.acMode ? s.acMode.toUpperCase() : "—";
    const acSetpoint =
        typeof s.acSetpoint === "number" && Number.isFinite(s.acSetpoint) ? \`\${s.acSetpoint.toFixed(0)}°C\` : "—";
    const cooling =
        typeof s.acCoolingActive === "boolean" ? (s.acCoolingActive ? "active" : "inactive") : "—";

    const scheduleLine = s.forceOff
        ? "Schedule: Outside hours (lights/fan forced OFF)"
        : "Schedule: Inside hours";
    const afterLine =
        s.afterHoursAlert && s.motion ? " · After-hours motion detected" : "";
    const mlLine =
        typeof s.mlPredictedTemp === "number" && Number.isFinite(s.mlPredictedTemp)
            ? \`ML Insight: Pred \${s.mlPredictedTemp.toFixed(1)}°C · Conf \${typeof s.mlConfidence === "number" && Number.isFinite(s.mlConfidence) ? Math.round(s.mlConfidence * 100) + "%" : "—"} · Anomaly \${s.mlAnomaly ? "YES" : "NO"}\`
            : \`ML Insight: predicted temp unavailable\`;

    let action = "Recommended action: keep current settings and monitor";
    if (s.forceOff) action = "Recommended action: outside hours; keep devices OFF";
    else if (s.afterHoursAlert && s.motion) action = "Recommended action: investigate after-hours motion/intrusion";
    else if (typeof s.temperature === "number" && Number.isFinite(s.temperature) && typeof s.tempThreshold === "number" && Number.isFinite(s.tempThreshold)) {
        action =
            s.temperature > s.tempThreshold + 0.5
                ? "Recommended action: increase cooling / lower AC setpoint"
                : s.temperature < 18
                    ? "Recommended action: check heating needs / adjust setpoint"
                    : "Recommended action: maintain settings (comfort OK)";
    }

    const line1 = \`- Classroom: \${occ} · Mode \${mode} · Lights \${lights} · Fans \${fans}\`;
    const line2 = \`- Temperature: \${temp} vs \${threshold} · \${comfort.replace(/^Comfort:\\s*/, "")}\`;
    const line3 = s.acPower === null && s.acMode === null
        ? "- AC System: AC state unavailable"
        : \`- AC System: Power \${acPower} · Mode \${acMode} · Setpoint \${acSetpoint} · Cooling \${cooling}\`;
    const line4 = \`- \${scheduleLine}\${afterLine}\`;
    const line5 = \`- \${mlLine.replace(/^ML Insight:\\s*/, "")}\`;
    const line6 = \`- \${action.replace(/^Recommended action:\\s*/, "")}\`;

    return [line1, line2, line3, line4, line5, line6].join("\\n");
}`;
}

const raw = fs.readFileSync(flowPath, "utf8");
const flow = JSON.parse(raw);

const targetNode = flow.find((n) => n && n.name === "API AI Report Prepare" && typeof n.func === "string");
if (!targetNode) throw new Error('Could not find node with name "API AI Report Prepare"');

const func = targetNode.func;

const stateStart = func.indexOf("const state = {");
if (stateStart < 0) throw new Error("Could not find `const state = {` in API AI Report Prepare func");

const userBlockStart = func.indexOf("const userBlock = JSON.stringify(state, null, 2);", stateStart);
if (userBlockStart < 0) throw new Error("Could not find `const userBlock = ...` in API AI Report Prepare func");

const newState = buildNewStateObjectCode();
const newSystemPrompt = buildNewSystemPromptCode();
const newBuildFallback = buildNewBuildFallbackCode();

// Replace the whole segment between `const state = { ... };` and `const userBlock = ...`
// to guarantee we don't leave any leftover/corrupted code from partial earlier edits.
const newRegion =
  newState +
  "\n\n" +
  newBuildFallback +
  "\n\n" +
  "const fallbackText = buildFallback(state);\n" +
  "msg._fallbackSummary = fallbackText;\n\n" +
  newSystemPrompt +
  "\n\n";

targetNode.func = func.slice(0, stateStart) + newRegion + func.slice(userBlockStart);

fs.writeFileSync(flowPath, JSON.stringify(flow, null, 4), "utf8");
console.log("Updated API AI Report Prepare prompt + state + fallback formatting.");


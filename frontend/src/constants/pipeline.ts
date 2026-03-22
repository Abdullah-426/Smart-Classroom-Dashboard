/**
 * Header dot + downtime (Node-RED tick): Schmitt hysteresis.
 * - `age <= LIVE_MAX` → live
 * - `age > DEAD_MIN` → dead (~7s+ after last MQTT with 1s polls)
 * - Between → keep previous (wide band reduces jitter vs 4.5/5.5s)
 *
 * Must match **Build downtime tick POST** in `all_flows_edit.json`.
 */
export const PIPELINE_LIVE_MAX_AGE_MS = 4000;
export const PIPELINE_DEAD_MIN_AGE_MS = 7000;

/**
 * Temperature chart only (wider Schmitt than header dot / downtime).
 * Prevents 1-poll “hairline” gaps when MQTT age wobbles above a single threshold.
 * - `age <= LIVE_MAX` → draw line
 * - `age >= DEAD_MIN` → break line (null point)
 * - Between → keep previous chart state
 *
 * Header dot stays at 4s / 7s; chart gaps only after ~22s of silence.
 */
export const CHART_LINE_LIVE_MAX_AGE_MS = 8000;
export const CHART_LINE_DEAD_MIN_AGE_MS = 22_000;

/** Dashboard poll interval */
export const DASHBOARD_POLL_MS = 1000;

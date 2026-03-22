/**
 * Header dot + downtime (Node-RED “Build downtime tick POST”): same Schmitt + 2-poll dead confirm.
 * Flow stores `pipelineDeadPollStreak` + `pipelineStableLive`; `age == null` (no MQTT yet) holds previous.
 */
export const PIPELINE_LIVE_MAX_AGE_MS = 4000;
export const PIPELINE_DEAD_MIN_AGE_MS = 7000;

/**
 * Temperature gauge + trend line segment (~6s dead with 1s polls).
 * Frontend debounces: unknown age holds previous; two consecutive polls above DEAD required to flip dead.
 */
export const GAUGE_CHART_LIVE_MAX_AGE_MS = 4000;
export const GAUGE_CHART_DEAD_MIN_AGE_MS = 6000;

/** Dashboard poll interval */
export const DASHBOARD_POLL_MS = 1000;

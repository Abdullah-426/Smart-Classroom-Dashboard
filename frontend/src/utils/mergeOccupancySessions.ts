import type { OccupancySessionDetail } from "../types/dashboard";

/** Stable id for merge + PATCH /flag (must match storage-bridge.mjs). */
export function occupancySessionKey(s: OccupancySessionDetail): string {
  return `${s.startedAtIso ?? ""}|${s.endedAtIso ?? ""}|${s.durationText}`;
}

/**
 * Merge file-backed sessions with live Node-RED list; newest ended first.
 * Preserves `flagged` from storage when live overwrites the same session.
 */
export function mergeOccupancySessionLists(
  stored: OccupancySessionDetail[],
  live: OccupancySessionDetail[],
): OccupancySessionDetail[] {
  const map = new Map<string, OccupancySessionDetail>();
  for (const s of stored) {
    map.set(occupancySessionKey(s), { ...s, flagged: Boolean(s.flagged) });
  }
  for (const s of live) {
    const k = occupancySessionKey(s);
    const prev = map.get(k);
    map.set(k, {
      ...s,
      flagged: prev?.flagged === true,
    });
  }
  return [...map.values()].sort((a, b) => {
    const ea = a.endedAtIso ? Date.parse(a.endedAtIso) : 0;
    const eb = b.endedAtIso ? Date.parse(b.endedAtIso) : 0;
    return eb - ea;
  });
}

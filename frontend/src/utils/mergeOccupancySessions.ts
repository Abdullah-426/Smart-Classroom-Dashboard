import type { OccupancySessionDetail } from "../types/dashboard";

function sessionKey(s: OccupancySessionDetail): string {
  return `${s.startedAtIso ?? ""}|${s.endedAtIso ?? ""}|${s.durationText}`;
}

/** Merge file-backed sessions with live Node-RED list; newest ended first. */
export function mergeOccupancySessionLists(
  stored: OccupancySessionDetail[],
  live: OccupancySessionDetail[],
): OccupancySessionDetail[] {
  const map = new Map<string, OccupancySessionDetail>();
  for (const s of stored) map.set(sessionKey(s), s);
  for (const s of live) map.set(sessionKey(s), s);
  return [...map.values()].sort((a, b) => {
    const ea = a.endedAtIso ? Date.parse(a.endedAtIso) : 0;
    const eb = b.endedAtIso ? Date.parse(b.endedAtIso) : 0;
    return eb - ea;
  });
}

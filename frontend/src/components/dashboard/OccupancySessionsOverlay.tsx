import { X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CurrentOccupancySession, OccupancySessionDetail } from "../../types/dashboard";

const OVERLAY_TRANSITION_MS = 300;
import { storageApi } from "../../services/storageApi";
import { occupancySessionKey } from "../../utils/mergeOccupancySessions";
import { SessionDetailModal } from "./SessionDetailModal";

function formatIsoShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

interface OccupancySessionsOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Merged list (storage + Node-RED), completed sessions. */
  sessions: OccupancySessionDetail[];
  /** From storage-bridge when room is occupied. */
  currentFromStorage: CurrentOccupancySession | null;
  /** Fallback when bridge current is unknown but summary says occupied. */
  summaryOccupied: boolean;
  summaryOccupancyTimer: string;
  /** Keys that exist in `occupancy-sessions.json` (flag only persists for these). */
  storedSessionKeys: string[];
  onRefresh: () => void | Promise<void>;
}

export function OccupancySessionsOverlay({
  open,
  onClose,
  sessions,
  currentFromStorage,
  summaryOccupied,
  summaryOccupancyTimer,
  storedSessionKeys,
  onRefresh,
}: OccupancySessionsOverlayProps) {
  const [detailSession, setDetailSession] = useState<OccupancySessionDetail | null>(null);
  const [flagBusyKey, setFlagBusyKey] = useState<string | null>(null);
  /** Keep portal mounted during exit so opacity transition can finish. */
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const storedSet = useMemo(() => new Set(storedSessionKeys), [storedSessionKeys]);

  const inProgress = useMemo((): CurrentOccupancySession | null => {
    if (currentFromStorage) return currentFromStorage;
    if (summaryOccupied) {
      return {
        active: true,
        sessionNumber: null,
        startedAtIso: null,
        durationSoFarText: summaryOccupancyTimer,
      };
    }
    return null;
  }, [currentFromStorage, summaryOccupied, summaryOccupancyTimer]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), OVERLAY_TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) setDetailSession(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  async function handleFlagToggle(s: OccupancySessionDetail, nextFlagged: boolean) {
    const key = occupancySessionKey(s);
    setFlagBusyKey(key);
    try {
      await storageApi.patchOccupancySessionFlag(key, nextFlagged);
      await onRefresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update flag");
    } finally {
      setFlagBusyKey(null);
    }
  }

  if (!mounted) return null;

  /**
   * Portal to `document.body` so `position:fixed` is not trapped by dashboard `main` / transforms.
   * Slightly inset panel + full-screen blurred scrim; fade in/out via `visible`.
   */
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="occ-sessions-title"
      >
        <button
          type="button"
          className={clsx(
            "absolute inset-0 bg-slate-950/50 backdrop-blur-xl backdrop-saturate-150 transition-opacity ease-out",
            visible ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDuration: `${OVERLAY_TRANSITION_MS}ms` }}
          aria-label="Close occupancy sessions"
          onClick={onClose}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 py-10 sm:px-10 sm:py-14 md:px-14 md:py-16">
          <div
            className={clsx(
              "flex max-h-[min(76vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl transition-[opacity,transform] ease-out will-change-[opacity,transform] dark:border-slate-600/90 dark:bg-slate-900",
              visible
                ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                : "pointer-events-none translate-y-2 scale-[0.97] opacity-0",
            )}
            style={{ transitionDuration: `${OVERLAY_TRANSITION_MS}ms` }}
          >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 dark:border-slate-700">
          <div>
            <h2 id="occ-sessions-title" className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
              Occupancy sessions
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Completed sessions from local storage and Node-RED. Flags are saved in{" "}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">data/occupancy-sessions.json</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-2 sm:px-6 sm:py-3">
          <div className="h-full min-h-[12rem] overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                  <th className="w-14 px-3 py-3 text-center">Flag</th>
                  <th className="px-3 py-3">Session</th>
                  <th className="px-3 py-3">Duration</th>
                  <th className="px-3 py-3">Started</th>
                  <th className="px-3 py-3">Ended</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {inProgress ? (
                  <tr className="bg-sky-50/80 dark:bg-sky-950/30">
                    <td className="px-3 py-3 text-center text-xs text-slate-400 dark:text-slate-500">—</td>
                    <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-200">
                      {inProgress.sessionNumber != null ? `Session ${inProgress.sessionNumber}` : "In progress"}
                    </td>
                    <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{inProgress.durationSoFarText}</td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{formatIsoShort(inProgress.startedAtIso)}</td>
                    <td className="px-3 py-3 text-slate-400">—</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                        In progress
                      </span>
                    </td>
                  </tr>
                ) : null}
                {sessions.length === 0 && !inProgress ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No occupancy sessions recorded yet.
                    </td>
                  </tr>
                ) : null}
                {sessions.map((s) => {
                  const key = occupancySessionKey(s);
                  const canFlag = Boolean(s.endedAtIso) && storedSet.has(key);
                  const label = s.legacy
                    ? s.durationText || "Legacy"
                    : `Session ${s.sessionNumber ?? "—"}: ${s.durationText}`;
                  return (
                    <tr
                      key={key}
                      className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      onClick={() => setDetailSession(s)}
                    >
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={Boolean(s.flagged)}
                          disabled={!canFlag || flagBusyKey === key}
                          title={
                            canFlag
                              ? "Flag this session"
                              : s.endedAtIso
                                ? "Flag is available only for sessions saved in local storage"
                                : "Complete the session before flagging"
                          }
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => void handleFlagToggle(s, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600"
                          aria-label={`Flag ${label}`}
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-200">{label}</td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300">{s.durationText || "—"}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{formatIsoShort(s.startedAtIso)}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{formatIsoShort(s.endedAtIso)}</td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Completed</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 sm:w-auto sm:px-8"
          >
            Close
          </button>
        </div>
          </div>
        </div>
      </div>

      {detailSession ? <SessionDetailModal session={detailSession} onClose={() => setDetailSession(null)} /> : null}
    </>,
    document.body,
  );
}

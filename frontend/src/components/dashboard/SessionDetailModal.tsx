import { X } from "lucide-react";
import { useEffect } from "react";
import type { OccupancySessionDetail } from "../../types/dashboard";

function formatIso(iso: string | null): string {
  if (!iso) return "Unknown";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  } catch {
    return iso;
  }
}

interface SessionDetailModalProps {
  session: OccupancySessionDetail;
  onClose: () => void;
}

export function SessionDetailModal({ session, onClose }: SessionDetailModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = session.legacy
    ? "Occupancy session (legacy)"
    : `Occupancy session ${session.sessionNumber ?? ""}`.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="session-detail-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Duration</dt>
            <dd className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">{session.durationText || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Session started</dt>
            <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{formatIso(session.startedAtIso)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Session ended</dt>
            <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{formatIso(session.endedAtIso)}</dd>
          </div>
          {session.legacy ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              This entry was recorded before detailed timestamps were available.
            </p>
          ) : null}
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Close
        </button>
      </div>
    </div>
  );
}

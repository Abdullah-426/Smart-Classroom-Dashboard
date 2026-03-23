import { RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { AttendanceTagSummary } from "../../types/dashboard";
import { Card } from "../ui/Card";
import { useAttendanceData } from "../../hooks/useAttendanceData";

function StatusPill({ tone, children }: { tone: "emerald" | "amber" | "rose" | "slate"; children: string }) {
  const cls =
    tone === "emerald"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
        : tone === "rose"
          ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
          : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function formatIso(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function tagSortKey(t: AttendanceTagSummary) {
  // backend already orders present->late->others, but we keep stable UX.
  if (t.present) return 0;
  if (t.late) return 1;
  return 2;
}

function TagRow({ tag }: { tag: AttendanceTagSummary }) {
  let tone: "emerald" | "amber" | "rose" | "slate" = "slate";
  let label = "ABSENT";
  if (tag.present) {
    tone = "emerald";
    label = "PRESENT";
  } else if (tag.late) {
    tone = "amber";
    label = "LATE";
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/40 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/30">
      <div>
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{tag.tagId}</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Last scan: <span className="font-semibold tabular-nums">{formatIso(tag.lastSeenAtIso)}</span> • Events:{" "}
          <span className="font-semibold tabular-nums">{tag.eventCount}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>
    </div>
  );
}

export function AttendanceTrackerPage() {
  const { data, loading, error, reset } = useAttendanceData();
  const [resetBusy, setResetBusy] = useState(false);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.tags].sort((a, b) => tagSortKey(a) - tagSortKey(b));
  }, [data]);

  async function handleReset() {
    if (resetBusy) return;
    setResetBusy(true);
    try {
      await reset();
    } finally {
      setResetBusy(false);
    }
  }

  const session = data?.session;

  return (
    <section className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Attendance Session" subtitle="RFID scans collected from Wokwi hardware" icon={<span className="text-sky-500">●</span>}>
          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Loading attendance…</p>
          ) : error ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">Attendance API error: {error}</p>
          ) : !data ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">No data yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Present now</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{data.presentCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/40 p-3 dark:border-slate-800/60 dark:bg-slate-900/30">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Late threshold</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Late if first scan is after <span className="font-semibold tabular-nums">{session ? formatIso(new Date(session.lateAfterMs).toISOString()) : "-"}</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Present if last scan within <span className="font-semibold tabular-nums">{session?.absenceTimeoutMs ?? 0} ms</span>
                </p>
              </div>
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => void handleReset()}
                className="w-full rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {resetBusy ? "Resetting…" : "Reset attendance (clears scans)"}
              </button>
            </div>
          )}
        </Card>

        <Card title="Present / Late Tags" subtitle="Duplicate suppression + live status from storage" icon={<span className="text-emerald-400">◎</span>}>
          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Updating…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Tap an RFID card in Wokwi. Scans will appear here with their live status.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.slice(0, 10).map((tag) => (
                <TagRow key={tag.tagId} tag={tag} />
              ))}
              {sorted.length > 10 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Showing 10 of {sorted.length} tags.</p>
              ) : null}
            </div>
          )}
        </Card>

        <Card title="Live Scan Hint" subtitle="Hardware-backed attendance simulation" icon={<RefreshCcw size={18} />}>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <p>
              This page updates by polling the RFID telemetry stored by the backend.
            </p>
            <div className="rounded-2xl border border-slate-200/80 bg-white/40 p-3 text-[11px] dark:border-slate-800/60 dark:bg-slate-900/30">
              <p className="font-semibold text-slate-800 dark:text-slate-100">How to test in Wokwi</p>
              <p className="mt-1">
                Click the <span className="font-semibold">MFRC522 (rfid1)</span> and use Tap or Hold to present different cards.
              </p>
              <p className="mt-2">
                First scan time determines <span className="font-semibold">Late</span>. Live status becomes <span className="font-semibold">Absent</span> when no scan is seen within the backend timeout.
              </p>
            </div>
          </div>
        </Card>
      </section>
  );
}


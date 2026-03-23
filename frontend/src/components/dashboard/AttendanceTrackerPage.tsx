import { RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { AttendanceLiveScanRow, AttendanceStudentRow } from "../../types/dashboard";
import { Card } from "../ui/Card";
import { useAttendanceData } from "../../hooks/useAttendanceData";
import { dashboardApi } from "../../services/api";

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

function studentSortKey(t: AttendanceStudentRow) {
  if (t.state === "present") return 0;
  if (t.state === "late") return 1;
  return 2;
}

function StudentRow({ tag }: { tag: AttendanceStudentRow }) {
  let tone: "emerald" | "amber" | "rose" | "slate" = "slate";
  let label = "ABSENT";
  if (tag.state === "present") {
    tone = "emerald";
    label = "PRESENT";
  } else if (tag.state === "late") {
    tone = "amber";
    label = "LATE";
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/40 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/30">
      <div>
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          {tag.studentId} · {tag.name}
        </p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Card: <span className="font-semibold">{tag.tagId}</span> • Last scan:{" "}
          <span className="font-semibold tabular-nums">{formatIso(tag.lastSeenAtIso)}</span> • Scans:{" "}
          <span className="font-semibold tabular-nums">{tag.scanCount}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>
    </div>
  );
}

function ScanRow({ row }: { row: AttendanceLiveScanRow }) {
  const tone =
    row.status === "present"
      ? "emerald"
      : row.status === "late"
        ? "amber"
        : row.status === "duplicate"
          ? "slate"
          : "rose";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/40 px-3 py-2 dark:border-slate-800/60 dark:bg-slate-900/30">
      <div>
        <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
          {row.studentName ? `${row.studentName} (${row.studentId})` : row.tagId}
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          {formatIso(row.receivedAtIso)} · {row.reason}
        </p>
      </div>
      <StatusPill tone={tone}>{row.status.toUpperCase()}</StatusPill>
    </div>
  );
}

export function AttendanceTrackerPage() {
  const { data, loading, error, reset, startSession, endSession } = useAttendanceData();
  const [resetBusy, setResetBusy] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [endBusy, setEndBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "present" | "late" | "absent">("all");

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.students]
      .filter((s) => {
        if (filter !== "all" && s.state !== filter) return false;
        const qq = q.trim().toLowerCase();
        if (!qq) return true;
        return (
          s.name.toLowerCase().includes(qq) ||
          s.studentId.toLowerCase().includes(qq) ||
          s.tagId.toLowerCase().includes(qq)
        );
      })
      .sort((a, b) => studentSortKey(a) - studentSortKey(b));
  }, [data, filter, q]);

  async function handleReset() {
    if (resetBusy) return;
    setResetBusy(true);
    try {
      await reset();
    } finally {
      setResetBusy(false);
    }
  }

  async function handleStartSession() {
    if (startBusy) return;
    setStartBusy(true);
    try {
      await startSession({
        className: "Smart Classroom Demo",
        courseName: "IoT Systems Lab",
        section: "CSE-A",
        lateAfterMinutes: 10,
      });
    } finally {
      setStartBusy(false);
    }
  }

  async function handleEndSession() {
    if (endBusy) return;
    setEndBusy(true);
    try {
      await endSession();
    } finally {
      setEndBusy(false);
    }
  }

  const session = data?.session;
  const stats = data?.stats;

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
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-slate-200/70 bg-white/40 p-2 dark:border-slate-800/60 dark:bg-slate-900/30">
                  <p className="text-slate-500">Present</p>
                  <p className="font-bold text-emerald-500">{stats?.presentCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/40 p-2 dark:border-slate-800/60 dark:bg-slate-900/30">
                  <p className="text-slate-500">Late</p>
                  <p className="font-bold text-amber-500">{stats?.lateCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/40 p-2 dark:border-slate-800/60 dark:bg-slate-900/30">
                  <p className="text-slate-500">Absent</p>
                  <p className="font-bold text-rose-500">{stats?.absentCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/40 p-2 dark:border-slate-800/60 dark:bg-slate-900/30">
                  <p className="text-slate-500">Attendance %</p>
                  <p className="font-bold text-sky-500">{stats?.attendancePercent ?? 0}%</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/40 p-3 dark:border-slate-800/60 dark:bg-slate-900/30">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {data.className} · {data.courseName}
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Session:{" "}
                  <span className="font-semibold">{session?.active ? "ACTIVE" : "ENDED"}</span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Late if first scan is after{" "}
                  <span className="font-semibold tabular-nums">
                    {session && session.lateAfterMs ? formatIso(new Date(session.lateAfterMs).toISOString()) : "-"}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Present if last scan within <span className="font-semibold tabular-nums">{session?.absenceTimeoutMs ?? 0} ms</span>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  disabled={startBusy}
                  onClick={() => void handleStartSession()}
                  className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {startBusy ? "Starting…" : "Start Session"}
                </button>
                <button
                  type="button"
                  disabled={endBusy}
                  onClick={() => void handleEndSession()}
                  className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {endBusy ? "Ending…" : "End Session"}
                </button>
                <button
                  type="button"
                  disabled={resetBusy}
                  onClick={() => void handleReset()}
                  className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {resetBusy ? "Resetting…" : "Reset"}
                </button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Student Attendance" subtitle="Search/filter roster with live status" icon={<span className="text-emerald-400">◎</span>}>
          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Updating…</p>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No matching students for current filter/query.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search student / ID / tag"
                  className="min-w-[180px] flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="all">All</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
                <a
                  href={dashboardApi.attendanceExportCsvUrl()}
                  className="rounded-xl border border-sky-400 px-3 py-2 text-xs font-semibold text-sky-500"
                >
                  Export CSV
                </a>
              </div>
              {sorted.slice(0, 12).map((tag) => (
                <StudentRow key={tag.studentId} tag={tag} />
              ))}
              {sorted.length > 12 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Showing 12 of {sorted.length} students.</p>
              ) : null}
            </div>
          )}
        </Card>

        <Card title="Recent Scans" subtitle="Valid, duplicate, invalid, and late scan events" icon={<RefreshCcw size={18} />}>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {!!stats ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-slate-200/70 bg-white/40 p-2 dark:border-slate-800/60 dark:bg-slate-900/30">
                  Invalid: <span className="font-bold text-rose-500">{stats.invalidCount}</span>
                </div>
                <div className="rounded-xl border border-slate-200/70 bg-white/40 p-2 dark:border-slate-800/60 dark:bg-slate-900/30">
                  Duplicates: <span className="font-bold text-slate-400">{stats.duplicateCount}</span>
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              {(data?.recentScans ?? []).slice(0, 8).map((r, i) => (
                <ScanRow key={`${r.tagId}-${r.receivedAtIso}-${i}`} row={r} />
              ))}
              {(data?.recentScans ?? []).length === 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">No scans yet in this session.</p>
              ) : null}
            </div>
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


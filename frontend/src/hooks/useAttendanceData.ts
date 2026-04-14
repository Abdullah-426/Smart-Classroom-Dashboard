import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dashboardApi } from "../services/api";
import type { AttendanceLivePayload } from "../types/dashboard";

const ATTENDANCE_POLL_MS = 2500;

export function useAttendanceData() {
  const [data, setData] = useState<AttendanceLivePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await dashboardApi.getAttendanceLive();
      setData(res);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, ATTENDANCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const reset = useCallback(async () => {
    await dashboardApi.resetAttendance();
    setData(null);
    setLoading(true);
    await load();
  }, [load]);

  const startSession = useCallback(
    async (input?: {
      className?: string;
      courseName?: string;
      subjectCode?: string;
      section?: string;
      lateAfterMinutes?: number;
      duplicateSuppressMs?: number;
      absenceTimeoutMs?: number;
    }) => {
      await dashboardApi.startAttendanceSession(input);
      await load();
    },
    [load],
  );

  const endSession = useCallback(async () => {
    await dashboardApi.endAttendanceSession();
    await load();
  }, [load]);

  const addSubject = useCallback(
    async (input: { name: string; code: string }) => {
      await dashboardApi.addAttendanceSubject(input);
      await load();
    },
    [load],
  );

  const updateSubject = useCallback(
    async (input: { currentCode: string; name: string; code: string }) => {
      await dashboardApi.updateAttendanceSubject(input);
      await load();
    },
    [load],
  );

  const deleteSubject = useCallback(
    async (code: string) => {
      await dashboardApi.deleteAttendanceSubject(code);
      await load();
    },
    [load],
  );

  const presentStudents = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data.students) ? data.students.filter((t) => t.state !== "absent") : [];
  }, [data]);

  return { data, loading, error, reset, startSession, endSession, addSubject, updateSubject, deleteSubject, presentStudents };
}


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dashboardApi } from "../services/api";
import type { AttendanceSummaryPayload } from "../types/dashboard";

const ATTENDANCE_POLL_MS = 2500;

export function useAttendanceData() {
  const [data, setData] = useState<AttendanceSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await dashboardApi.getAttendance();
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

  const presentTags = useMemo(() => {
    if (!data) return [];
    return Array.isArray(data.tags) ? data.tags.filter((t) => t.present) : [];
  }, [data]);

  return { data, loading, error, reset, presentTags };
}


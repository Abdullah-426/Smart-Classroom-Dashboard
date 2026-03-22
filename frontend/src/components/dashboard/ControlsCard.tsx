import { SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import type { CommandPayload, ScheduleStateResponse } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface ControlsCardProps {
  onSendCommand: (command: CommandPayload) => Promise<void>;
  onToggleSchedule: () => Promise<void>;
  scheduleState: ScheduleStateResponse | null;
}

const SCHEDULE_ACTIVE_HOURS = "08:00–18:00";

const presets = [
  { label: "Lecture", value: 28 },
  { label: "Exam", value: 26 },
  { label: "Energy Saver", value: 30 },
];

export function ControlsCard({ onSendCommand, onToggleSchedule, scheduleState }: ControlsCardProps) {
  const [presetValue, setPresetValue] = useState("28");
  const [autoBusy, setAutoBusy] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  /** Visual only — button stays focusable/clickable; ref blocks double-submit. */
  const [scheduleWorking, setScheduleWorking] = useState(false);
  const scheduleLockRef = useRef(false);

  const scheduleEnabled = scheduleState?.scheduleEnabled ?? null;

  async function sendAuto(command: CommandPayload) {
    setAutoBusy(true);
    try {
      await onSendCommand(command);
    } finally {
      setAutoBusy(false);
    }
  }

  async function sendManual(command: CommandPayload) {
    setManualBusy(true);
    try {
      await onSendCommand(command);
    } finally {
      setManualBusy(false);
    }
  }

  async function sendPreset(command: CommandPayload) {
    setPresetBusy(true);
    try {
      await onSendCommand(command);
    } finally {
      setPresetBusy(false);
    }
  }

  function handleScheduleClick() {
    if (scheduleLockRef.current) return;
    scheduleLockRef.current = true;
    setScheduleWorking(true);
    void (async () => {
      try {
        await onToggleSchedule();
      } catch {
        /* App + API handle notice; always unlock UI */
      } finally {
        scheduleLockRef.current = false;
        setScheduleWorking(false);
      }
    })();
  }

  return (
    <Card title="Controls" subtitle="Manual and automatic control commands" icon={<SlidersHorizontal size={18} />}>
      <div className="space-y-3">
        <button
          type="button"
          disabled={autoBusy}
          onClick={() => sendAuto({ mode: "auto", forceOff: false, afterHoursAlert: false })}
          className="w-full rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
        >
          AUTO
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={manualBusy}
            onClick={() => sendManual({ mode: "manual", light: 1, forceOff: false, afterHoursAlert: false })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700"
          >
            Light ON
          </button>
          <button
            type="button"
            disabled={manualBusy}
            onClick={() => sendManual({ mode: "manual", light: 0, forceOff: false, afterHoursAlert: false })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700"
          >
            Light OFF
          </button>
          <button
            type="button"
            disabled={manualBusy}
            onClick={() => sendManual({ mode: "manual", fan: 1, forceOff: false, afterHoursAlert: false })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700"
          >
            Fan ON
          </button>
          <button
            type="button"
            disabled={manualBusy}
            onClick={() => sendManual({ mode: "manual", fan: 0, forceOff: false, afterHoursAlert: false })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700"
          >
            Fan OFF
          </button>
        </div>
        <div className="space-y-2">
          <label htmlFor="preset" className="text-xs text-slate-500 dark:text-slate-400">
            Preset mode threshold
          </label>
          <select
            id="preset"
            value={presetValue}
            onChange={(e) => setPresetValue(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {presets.map((preset) => (
              <option key={preset.label} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={presetBusy}
            onClick={() =>
              sendPreset({
                mode: "auto",
                tempThreshold: Number(presetValue),
                forceOff: false,
                afterHoursAlert: false,
              })
            }
            className="w-full rounded-xl border border-sky-400 px-3 py-2 text-xs font-medium text-sky-600 dark:text-sky-400"
          >
            Apply Preset
          </button>
        </div>
        <button
          type="button"
          onClick={handleScheduleClick}
          aria-busy={scheduleWorking}
          className="relative z-10 w-full rounded-xl border border-violet-400 px-3 py-2 text-xs font-medium text-violet-600 dark:text-violet-400"
        >
          {scheduleWorking
            ? "Updating schedule…"
            : scheduleEnabled === null
              ? "Schedule: Unknown"
              : scheduleEnabled
                ? "Disable Schedule"
                : "Enable Schedule"}
        </button>
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            scheduleEnabled === true
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
              : scheduleEnabled === false
                ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200"
          }`}
        >
          <p className="font-medium">
            Schedule checker: {scheduleEnabled === null ? "Unknown" : scheduleEnabled ? "Enabled" : "Disabled"}
          </p>
          <p className="mt-1 text-[11px] opacity-90 dark:opacity-95">
            Active hours <span className="font-semibold tabular-nums text-current">{SCHEDULE_ACTIVE_HOURS}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

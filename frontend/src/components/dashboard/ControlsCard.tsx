import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { CommandPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface ControlsCardProps {
  onSendCommand: (command: CommandPayload) => Promise<void>;
  onToggleSchedule: () => Promise<void>;
  scheduleEnabled: boolean | null;
}

const presets = [
  { label: "Lecture", value: 28 },
  { label: "Exam", value: 26 },
  { label: "Energy Saver", value: 30 },
];

export function ControlsCard({ onSendCommand, onToggleSchedule, scheduleEnabled }: ControlsCardProps) {
  const [presetValue, setPresetValue] = useState("28");
  const [busy, setBusy] = useState(false);

  async function send(command: CommandPayload) {
    setBusy(true);
    await onSendCommand(command);
    setBusy(false);
  }

  return (
    <Card title="Controls" subtitle="Manual and automatic control commands" icon={<SlidersHorizontal size={18} />}>
      <div className="space-y-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => send({ mode: "auto", forceOff: false, afterHoursAlert: false })}
          className="w-full rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
        >
          AUTO
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ mode: "manual", light: 1, forceOff: false, afterHoursAlert: false })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700"
          >
            Light ON
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ mode: "manual", light: 0, forceOff: false, afterHoursAlert: false })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700"
          >
            Light OFF
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ mode: "manual", fan: 1, forceOff: false, afterHoursAlert: false })}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs dark:border-slate-700"
          >
            Fan ON
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ mode: "manual", fan: 0, forceOff: false, afterHoursAlert: false })}
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
            disabled={busy}
            onClick={() =>
              send({
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
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onToggleSchedule();
            setBusy(false);
          }}
          className="w-full rounded-xl border border-violet-400 px-3 py-2 text-xs font-medium text-violet-600 dark:text-violet-400"
        >
          {scheduleEnabled === null
            ? "Schedule: Unknown"
            : scheduleEnabled
              ? "Disable Schedule"
              : "Enable Schedule"}
        </button>
        <div
          className={`rounded-xl border px-3 py-2 text-xs font-medium ${
            scheduleEnabled
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          }`}
        >
          Schedule checker: {scheduleEnabled === null ? "Unknown" : scheduleEnabled ? "Enabled" : "Disabled"}
        </div>
      </div>
    </Card>
  );
}

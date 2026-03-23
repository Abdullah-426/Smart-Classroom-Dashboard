import { ThermometerSun, Wind } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CommandPayload, TelemetryPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

function Badge({
  tone,
  children,
}: {
  tone: "sky" | "emerald" | "amber" | "rose" | "slate";
  children: React.ReactNode;
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
        : tone === "rose"
          ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
          : tone === "sky"
            ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
            : "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function AcControlCard({
  telemetry,
  onSendCommand,
  className,
}: {
  telemetry: TelemetryPayload;
  onSendCommand: (c: CommandPayload) => Promise<void>;
  className?: string;
}) {
  const acPower = telemetry.acPower ?? true;
  const acMode = telemetry.acMode ?? telemetry.mode;
  const acSetpoint = telemetry.acSetpoint ?? telemetry.tempThreshold;
  const acCoolingActive = telemetry.acCoolingActive ?? false;
  const acManualOverride = telemetry.acManualOverride ?? false;

  const scheduleLocked = telemetry.forceOff;

  const [setpointDraft, setSetpointDraft] = useState(String(acSetpoint));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSetpointDraft(String(acSetpoint));
  }, [acSetpoint]);

  const setpointNumber = useMemo(() => Number(setpointDraft), [setpointDraft]);
  const setpointValid = Number.isFinite(setpointNumber) && setpointNumber > 0;

  async function send(cmd: CommandPayload) {
    setBusy(true);
    try {
      await onSendCommand(cmd);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="AC System"
      subtitle="Cooling automation + setpoint control"
      icon={<ThermometerSun size={18} />}
      className={`lg:col-span-1 ${className ?? ""}`}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={acPower ? "emerald" : "slate"}>{acPower ? "AC Power ON" : "AC Power OFF"}</Badge>
          <Badge tone={acMode === "auto" ? "sky" : "amber"}>Mode: {acMode.toUpperCase()}</Badge>
          {acCoolingActive ? <Badge tone="emerald">Cooling active</Badge> : <Badge tone="slate">Cooling off</Badge>}
          {scheduleLocked ? <Badge tone="rose">Schedule locked</Badge> : null}
          {acManualOverride ? <Badge tone="amber">Manual override</Badge> : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Power</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ acPower: true })}
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                  acPower ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                }`}
              >
                ON
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ acPower: false })}
                className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                  !acPower ? "bg-rose-500 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                }`}
              >
                OFF
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ acMode: "auto" })}
                  className={`flex h-10 min-w-[3.25rem] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold leading-none ${
                  acMode === "auto" ? "bg-sky-500 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                }`}
                  aria-label="Set AC mode to AUTO"
              >
                  A
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ acMode: "manual" })}
                  className={`flex h-10 min-w-[3.25rem] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold leading-none ${
                  acMode === "manual" ? "bg-amber-500 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                }`}
                  aria-label="Set AC mode to MANUAL"
              >
                  M
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">Setpoint (target °C)</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Used when `AC mode = AUTO`.</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
              {acCoolingActive ? <Wind size={14} /> : <ThermometerSun size={14} />}
              <span className="font-semibold tabular-nums">{acSetpoint.toFixed(0)}°C</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-center">
            <div className="sm:col-span-2">
              <input
                type="range"
                min={16}
                max={35}
                step={1}
                disabled={busy}
                value={setpointValid ? setpointNumber : acSetpoint}
                onChange={(e) => setSetpointDraft(e.target.value)}
                className="w-full accent-sky-500"
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <input
                type="number"
                min={16}
                max={35}
                step={1}
                disabled={busy}
                value={setpointDraft}
                onChange={(e) => setSetpointDraft(e.target.value)}
                className="w-16 rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={busy || !setpointValid}
                onClick={() => void send({ acSetpoint: Math.round(setpointNumber) })}
                className="rounded-xl bg-sky-500 px-2.5 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}


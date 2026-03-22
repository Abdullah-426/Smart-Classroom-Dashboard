import { Database, Trash2 } from "lucide-react";
import { useState } from "react";
import { STORAGE_BRIDGE_HELP, type StorageInfoResponse } from "../../services/storageApi";
import { Card } from "../ui/Card";

interface StoragePanelProps {
  storageInfo: StorageInfoResponse | null;
  onClearStorage: () => Promise<void>;
}

function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function StoragePanel({ storageInfo, onClearStorage }: StoragePanelProps) {
  const [busy, setBusy] = useState(false);

  async function handleClear() {
    if (!window.confirm("Clear all persisted telemetry and occupancy sessions on disk? This cannot be undone.")) {
      return;
    }
    setBusy(true);
    try {
      await onClearStorage();
    } finally {
      setBusy(false);
    }
  }

  const ok = storageInfo?.ok === true;
  const dir = storageInfo?.dataDirectory ?? "—";
  const ingestSinceStart = storageInfo?.bridgeIngestSinceStart ?? 0;
  const samples = storageInfo?.telemetrySampleCount ?? 0;
  const noIngestYet = ok && ingestSinceStart === 0 && samples === 0;

  return (
    <Card
      title="Local storage"
      subtitle="Persisted history (Wokwi → MQTT → Node-RED → storage bridge on port 4050). See fix steps below if Unreachable."
      icon={<Database size={18} />}
      className="lg:col-span-4"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Bridge status</p>
            <p className={`mt-1 font-medium ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {ok ? "Reachable" : "Unreachable"}
            </p>
            {!ok && storageInfo?.error ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{storageInfo.error}</p>
            ) : null}
            {ok ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                POSTs to /ingest (this session):{" "}
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{ingestSinceStart}</span>
                {storageInfo?.bridgeLastIngestIso ? (
                  <>
                    {" "}
                    · last:{" "}
                    <span className="font-mono text-[0.65rem] text-slate-600 dark:text-slate-300">
                      {storageInfo.bridgeLastIngestIso}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Telemetry samples</p>
            <p className="mt-1 font-medium tabular-nums">{storageInfo?.telemetrySampleCount ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Telemetry file size</p>
            <p className="mt-1 font-medium">{formatBytes(storageInfo?.telemetryFileBytes)}</p>
          </div>
          <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Stored occupancy sessions</p>
            <p className="mt-1 font-medium tabular-nums">{storageInfo?.occupancySessionCount ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800 sm:col-span-2 lg:col-span-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Data folder (gitignored)</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-slate-200">{dir}</p>
          </div>
          <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800 sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">Sample time range (UTC)</p>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
              {storageInfo?.oldestSampleIso ?? "—"} → {storageInfo?.newestSampleIso ?? "—"}
            </p>
          </div>
        </div>
        {noIngestYet ? (
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Bridge is up, but nothing has POSTed to /ingest yet</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
              The dashboard only talks to the bridge; <strong>Node-RED</strong> must POST each telemetry sample to{" "}
              <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">http://127.0.0.1:4050/ingest</code>.
              If that count stays <strong>0</strong> while MQTT is flowing, Node-RED is almost certainly calling the wrong
              host (common with Docker/WSL).
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4">
              <li>
                In Node-RED, open the <strong>POST storage bridge</strong> node. If Node-RED runs in{" "}
                <strong>Docker Desktop</strong>, set the URL to{" "}
                <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">
                  http://host.docker.internal:4050/ingest
                </code>{" "}
                (inside the container, <code className="font-mono">127.0.0.1</code> is the container itself, not your
                PC).
              </li>
              <li>
                Double-click the debug node <strong>storage bridge response</strong> (after POST) and set{" "}
                <strong>active</strong> — you should see a message every time a POST succeeds. Red errors on{" "}
                <strong>POST storage bridge</strong> mean the request never reached this bridge.
              </li>
              <li>
                If you use a corporate <code className="font-mono">HTTP_PROXY</code>, add{" "}
                <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">127.0.0.1,localhost</code> to{" "}
                <code className="font-mono">NO_PROXY</code> for the Node-RED process.
              </li>
              <li>
                Quick test (same PC as the bridge), PowerShell:
                <code className="mt-1 block break-all rounded bg-white/70 p-1 font-mono text-[0.65rem] dark:bg-black/40">
                  {`curl.exe -X POST http://127.0.0.1:4050/ingest -H "Content-Type: application/json" -d '{"temperature":22,"motion":true,"occupied":false}'`}
                </code>
                Then refresh — sample count should increase.
              </li>
            </ol>
          </div>
        ) : null}
        {!ok ? (
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">How to fix “Unreachable” / HTTP 502</p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
              Vite proxies <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">/api/storage</code> to{" "}
              <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">127.0.0.1:4050</code>. If nothing is
              listening there, you get connection refused → 502 in the browser.
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4">
              <li>
                Open a terminal in the <strong>project root</strong> (same folder as{" "}
                <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">storage-bridge.mjs</code>).
              </li>
              <li>
                Run <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">npm install</code> once (adds{" "}
                <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">concurrently</code> for the combo
                script).
              </li>
              <li>
                Either: <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">npm run storage</code> and
                leave it running, <strong>or</strong> stop your separate Vite terminal and use{" "}
                <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">npm run dev:all</code> to start
                bridge + frontend together.
              </li>
              <li>
                Keep Node-RED deployed with <strong>POST storage bridge</strong> →{" "}
                <code className="rounded bg-white/70 px-1 font-mono dark:bg-black/40">http://127.0.0.1:4050/ingest</code>.
              </li>
            </ol>
            <p className="mt-2 text-amber-900/85 dark:text-amber-200/80">{STORAGE_BRIDGE_HELP}</p>
          </div>
        ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleClear()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-400 bg-white px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
        >
          <Trash2 size={16} />
          {busy ? "Clearing…" : "Clear storage"}
        </button>
      </div>
    </Card>
  );
}

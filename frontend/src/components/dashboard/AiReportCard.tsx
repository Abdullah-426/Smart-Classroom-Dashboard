import { Sparkles } from "lucide-react";
import { useState } from "react";
import { dashboardApi } from "../../services/api";
import type { AiReportPayload } from "../../types/dashboard";
import { Card } from "../ui/Card";

interface AiReportCardProps {
  fallbackText?: string;
  className?: string;
}

function formatGeneratedAt(iso: string | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

export function AiReportCard({
  fallbackText = "AI report is not generated yet.",
  className,
}: AiReportCardProps) {
  const [report, setReport] = useState(fallbackText);
  const [meta, setMeta] = useState<Pick<AiReportPayload, "generatedAt" | "model" | "source"> | null>(null);
  const [busy, setBusy] = useState(false);

  async function onGenerate() {
    setBusy(true);
    try {
      const response = await dashboardApi.generateAiReport();
      setReport(response.summary || fallbackText);
      setMeta({
        generatedAt: response.generatedAt,
        model: response.model,
        source: response.source,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="AI Report"
      subtitle="Natural-language classroom summary"
      icon={<Sparkles size={18} />}
      className={className}
    >
      <div className="space-y-3">
        <div className="min-h-24 whitespace-pre-line rounded-xl bg-slate-100 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {report}
        </div>
        {meta?.generatedAt ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generated {formatGeneratedAt(meta.generatedAt)}
            {meta.model || meta.source
              ? ` · ${[meta.model, meta.source].filter(Boolean).join(" · ")}`
              : ""}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="w-full rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? "Generating..." : "Generate AI Report"}
        </button>
      </div>
    </Card>
  );
}

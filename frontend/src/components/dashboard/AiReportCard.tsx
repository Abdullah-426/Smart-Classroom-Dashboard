import { Sparkles } from "lucide-react";
import { useState } from "react";
import { dashboardApi } from "../../services/api";
import { Card } from "../ui/Card";

interface AiReportCardProps {
  fallbackText?: string;
}

export function AiReportCard({ fallbackText = "AI report is not generated yet." }: AiReportCardProps) {
  const [report, setReport] = useState(fallbackText);
  const [busy, setBusy] = useState(false);

  async function onGenerate() {
    setBusy(true);
    const response = await dashboardApi.generateAiReport();
    setReport(response.summary);
    setBusy(false);
  }

  return (
    <Card title="AI Report" subtitle="Natural-language classroom summary" icon={<Sparkles size={18} />}>
      <div className="space-y-3">
        <div className="min-h-24 rounded-xl bg-slate-100 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {report}
        </div>
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

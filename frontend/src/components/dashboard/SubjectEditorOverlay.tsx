import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AttendanceSubject } from "../../types/dashboard";

const OVERLAY_TRANSITION_MS = 250;

interface SubjectEditorOverlayProps {
  open: boolean;
  onClose: () => void;
  subjects: AttendanceSubject[];
  busy: boolean;
  error: string | null;
  onAdd: (input: { name: string; code: string }) => Promise<void>;
  onUpdate: (input: { currentCode: string; name: string; code: string }) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
}

type SubjectDraft = { originalCode: string; code: string; name: string };

export function SubjectEditorOverlay({
  open,
  onClose,
  subjects,
  busy,
  error,
  onAdd,
  onUpdate,
  onDelete,
}: SubjectEditorOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [drafts, setDrafts] = useState<SubjectDraft[]>([]);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  useEffect(() => {
    if (open) {
      // Initialize editor state only when opening.
      // Do not re-init on every poll/update while open, otherwise typed input gets wiped.
      setDrafts(subjects.map((s) => ({ originalCode: s.code, code: s.code, name: s.name })));
      setNewName("");
      setNewCode("");
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), OVERLAY_TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true" aria-labelledby="subject-editor-title">
      <button
        type="button"
        aria-label="Close subject editor"
        className={clsx(
          "absolute inset-0 bg-slate-950/55 backdrop-blur-xl transition-opacity",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: `${OVERLAY_TRANSITION_MS}ms` }}
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 py-10 sm:px-10">
        <div
          className={clsx(
            "pointer-events-auto flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl transition-[opacity,transform] dark:border-slate-700 dark:bg-slate-900",
            visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0",
          )}
          style={{ transitionDuration: `${OVERLAY_TRANSITION_MS}ms` }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <div>
              <h2 id="subject-editor-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Edit Subjects
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Add, update, or remove subject codes and names for attendance sessions.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
            {drafts.map((subject, idx) => (
              <div key={`${subject.originalCode}-${idx}`} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input
                  value={subject.name}
                  onChange={(e) =>
                    setDrafts((prev) => prev.map((s, i) => (i === idx ? { ...s, name: e.target.value } : s)))
                  }
                  placeholder="Subject name"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  value={subject.code}
                  onChange={(e) =>
                    setDrafts((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, code: e.target.value.toUpperCase() } : s)),
                    )
                  }
                  placeholder="Subject code"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs uppercase dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  disabled={busy || !subject.name.trim() || !subject.code.trim()}
                  onClick={async () => {
                    const nextCode = subject.code.trim().toUpperCase();
                    const nextName = subject.name.trim();
                    if (!nextCode || !nextName) return;
                    await onUpdate({ currentCode: subject.originalCode, name: nextName, code: nextCode });
                    setDrafts((prev) =>
                      prev.map((row, rowIdx) =>
                        rowIdx === idx ? { ...row, originalCode: nextCode, code: nextCode, name: nextName } : row,
                      ),
                    );
                  }}
                  className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={busy || drafts.length <= 1}
                  onClick={async () => {
                    await onDelete(subject.originalCode);
                    setDrafts((prev) => prev.filter((_, rowIdx) => rowIdx !== idx));
                  }}
                  className="rounded-xl border border-rose-400 px-3 py-2 text-xs font-semibold text-rose-500 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}

            <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Add New Subject</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Subject name"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Subject code"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs uppercase dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  disabled={busy || !newName.trim() || !newCode.trim()}
                  onClick={async () => {
                    const nextName = newName.trim();
                    const nextCode = newCode.trim().toUpperCase();
                    if (!nextName || !nextCode) return;
                    await onAdd({ name: nextName, code: nextCode });
                    setDrafts((prev) => [...prev, { originalCode: nextCode, code: nextCode, name: nextName }]);
                    setNewName("");
                    setNewCode("");
                  }}
                  className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  Add Subject
                </button>
              </div>
            </div>

            {error ? <p className="text-xs text-rose-500">{error}</p> : null}
          </div>

          <div className="border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-medium text-white hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

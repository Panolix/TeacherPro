import { FileText, Trash2, X } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "../../i18n/useTranslation";

interface Props {
  open: boolean;
  notes: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

/** Slide-in lesson notes panel. */
export function NotesPanel({ open, notes, onChange, onClose }: Props) {
  const { t } = useTranslation();

  return (
      <div
        inert={!open}
        aria-hidden={!open}
        role="dialog"
        aria-label={t("editor.panels.notes")}
        className={`fixed left-0 top-0 bottom-0 z-[200] w-[336px] max-w-[336px] print:hidden flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full border-r border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--tp-border-strong)] px-3 py-2">
            <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--tp-accent)]" />
            <span className="flex-1 truncate text-sm font-semibold text-[var(--tp-text-primary)]">{t("editor.panels.notes")}</span>
            <button
              onClick={() => {
                if (!notes.trim()) return;
                void ask(t("editor.panels.clearNotesConfirm"), {
                  title: t("editor.panels.clearNotes"),
                  kind: "warning",
                })
                  .then((confirmed) => {
                    if (confirmed) onChange("");
                  })
                  .catch((error) => {
                    console.error("Could not confirm clearing notes:", error);
                  });
              }}
              title={t("editor.panels.clearNotes")}
              aria-label={t("editor.panels.clearNotes")}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                notes.trim()
                  ? "text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-red-400"
                  : "text-[var(--tp-border-strong)] cursor-default pointer-events-none"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onClose()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
              title={t("editor.panels.closeNotes")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 p-3 bg-[var(--tp-app-bg)]">
            <textarea
              value={notes}
              aria-label={t("editor.panels.notes")}
              onChange={(event) => onChange(event.target.value)}
              className="h-full w-full resize-none overflow-y-auto rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] px-3 py-3 text-sm leading-relaxed text-[var(--tp-text-primary)] outline-none focus:border-[var(--tp-accent)] [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]"
            />
          </div>
        </div>
      </div>
  );
}
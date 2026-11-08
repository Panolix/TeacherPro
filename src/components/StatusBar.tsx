import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n/useTranslation";

const ZOOM_PRESETS: ReadonlyArray<number> = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

/**
 * StatusBar — bottom rail, visible across all views.
 * Shows vault status and view-specific info, plus lesson canvas zoom controls.
 */
export function StatusBar() {
  const {
    vaultPath,
    currentView,
    activeFilePath,
    lessonZoomMode,
    lessonZoomFixed,
    setLessonZoomMode,
    setLessonZoomFixed,
    lastSavedAt,
    documentSaveState,
    aiStatusMessage,
    setAiStatusMessage,
  } = useAppStore();

  const { t } = useTranslation();

  useEffect(() => {
    if (!aiStatusMessage) return;
    const timer = window.setTimeout(() => setAiStatusMessage(null), 6000);
    return () => window.clearTimeout(timer);
  }, [aiStatusMessage, setAiStatusMessage]);

  const zoomControlsVisible = currentView === "editor" && !!activeFilePath;

  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setZoomMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [zoomMenuOpen]);

  const zoomLabel =
    lessonZoomMode === "fit"
      ? t("statusBar.fit")
      : `${Math.round(lessonZoomFixed * 100)}%`;

  const bumpZoom = (delta: number) => {
    const base = lessonZoomMode === "fit" ? 1.0 : lessonZoomFixed;
    setLessonZoomFixed(Math.round((base + delta) * 100) / 100);
  };

  const vaultName = vaultPath?.split(/[\/\\]/).filter(Boolean).pop();

  return (
    <div
      className="tp-statusbar @container flex items-center gap-3 px-3 print:hidden shrink-0"
      style={{
        height: "var(--tp-statusbar-h)",
        background: "var(--tp-bg-1)",
        borderTop: "1px solid var(--tp-b-1)",
        color: "var(--tp-t-3)",
        fontSize: "var(--tp-font-body-sm)",
      }}
    >
      {vaultPath ? (
        <span
          className="inline-flex min-w-0 items-center gap-1.5"
          title={vaultPath}
        >
          <FolderOpen
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: "var(--tp-t-4)" }}
            aria-hidden="true"
          />
          <span className="max-w-[180px] truncate">{vaultName}</span>
        </span>
      ) : (
        <span>{t("statusBar.noVault")}</span>
      )}

      {documentSaveState === "saving" ? (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5"
        >
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          {t("statusBar.saving")}
        </span>
      ) : documentSaveState === "dirty" ? (
        <span
          role="status"
          aria-live="polite"
          style={{ color: "var(--tp-amber, #d97706)" }}
        >
          {t("statusBar.unsaved")}
        </span>
      ) : documentSaveState === "error" ? (
        <span role="alert" style={{ color: "var(--tp-red, #e11d48)" }}>
          {t("statusBar.saveFailed")}
        </span>
      ) : (
        lastSavedAt && (
          <span
            title={t("statusBar.saved", {
              time: format(new Date(lastSavedAt), "HH:mm:ss"),
            })}
          >
            {t("statusBar.saved", {
              time: format(new Date(lastSavedAt), "HH:mm"),
            })}
          </span>
        )
      )}

      {aiStatusMessage && (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 rounded px-2 py-0.5"
          style={{
            background: "var(--tp-bg-3)",
            border: "1px solid var(--tp-b-2)",
            color: "var(--tp-accent)",
          }}
          title={aiStatusMessage}
        >
          <Sparkles className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[420px]">{aiStatusMessage}</span>
        </span>
      )}

      <div className="flex-1" />

      {zoomControlsVisible && (
        <div
          ref={zoomMenuRef}
          className="relative inline-flex items-center gap-0.5 select-none"
        >
          <button
            type="button"
            onClick={() => bumpZoom(-0.1)}
            title={t("statusBar.zoomOut")}
            aria-label={t("statusBar.zoomOut")}
            className="inline-flex h-[24px] w-[22px] items-center justify-center rounded text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setZoomMenuOpen((v) => !v)}
            title={t("statusBar.zoomPresets")}
            aria-label={t("statusBar.zoomPresets")}
            aria-expanded={zoomMenuOpen}
            className="inline-flex h-[24px] min-w-[46px] items-center justify-center rounded px-1.5 font-medium tabular-nums text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            onClick={() => bumpZoom(0.1)}
            title={t("statusBar.zoomIn")}
            aria-label={t("statusBar.zoomIn")}
            className="inline-flex h-[24px] w-[22px] items-center justify-center rounded text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
          >
            <Plus className="w-3 h-3" />
          </button>

          {zoomMenuOpen && (
            <div
              className="absolute bottom-full right-0 z-[var(--tp-z-popover)] mb-1.5 min-w-[150px] rounded-[var(--tp-radius-control)] py-1 shadow-lg"
              style={{
                background: "var(--tp-bg-2)",
                border: "1px solid var(--tp-b-2)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setLessonZoomMode("fit");
                  setZoomMenuOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-[var(--tp-font-body-sm)] ${
                  lessonZoomMode === "fit"
                    ? "text-[var(--tp-accent)]"
                    : "text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                }`}
              >
                {t("statusBar.fitToWidth")}
              </button>
              <div
                className="mx-2 my-1 h-px"
                style={{ background: "var(--tp-b-1)" }}
              />
              {ZOOM_PRESETS.map((preset) => {
                const active =
                  lessonZoomMode === "fixed" &&
                  Math.abs(lessonZoomFixed - preset) < 0.001;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setLessonZoomFixed(preset);
                      setZoomMenuOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-[var(--tp-font-body-sm)] tabular-nums ${
                      active
                        ? "text-[var(--tp-accent)]"
                        : "text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                    }`}
                  >
                    {Math.round(preset * 100)}%
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

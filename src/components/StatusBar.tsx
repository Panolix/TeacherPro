import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useAppStore } from "../store";

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
    lessonPlans,
    mindmaps,
    lessonZoomMode,
    lessonZoomFixed,
    setLessonZoomMode,
    setLessonZoomFixed,
  } = useAppStore();

  const count =
    currentView === "editor"
      ? `${lessonPlans?.length ?? 0} lesson${(lessonPlans?.length ?? 0) === 1 ? "" : "s"}`
      : currentView === "mindmap"
        ? `${mindmaps?.length ?? 0} mindmap${(mindmaps?.length ?? 0) === 1 ? "" : "s"}`
        : null;

  const zoomControlsVisible =
    currentView === "editor" && !!activeFilePath && !!vaultPath;

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
      ? "Fit"
      : `${Math.round(lessonZoomFixed * 100)}%`;

  const bumpZoom = (delta: number) => {
    const base = lessonZoomMode === "fit" ? 1.0 : lessonZoomFixed;
    setLessonZoomFixed(Math.round((base + delta) * 100) / 100);
  };

  return (
    <div
      className="tp-statusbar flex items-center gap-3 px-3 print:hidden shrink-0"
      style={{
        height: "var(--tp-statusbar-h)",
        background: "var(--tp-bg-1)",
        borderTop: "1px solid var(--tp-b-1)",
        color: "var(--tp-t-4)",
        fontSize: "11px",
      }}
    >
      {vaultPath ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: "var(--tp-green)" }}
          />
          Vault synced
        </span>
      ) : (
        <span>No vault</span>
      )}

      {count && <span>{count}</span>}

      {activeFilePath && currentView === "editor" && (
        <span className="truncate">Editing</span>
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
            title="Zoom out (Cmd/Ctrl -)"
            className="h-[18px] w-[18px] inline-flex items-center justify-center rounded hover:bg-[var(--tp-bg-3)] hover:text-[var(--tp-t-2)] transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setZoomMenuOpen((v) => !v)}
            title="Zoom presets"
            className="min-w-[44px] h-[18px] px-1.5 inline-flex items-center justify-center rounded hover:bg-[var(--tp-bg-3)] hover:text-[var(--tp-t-2)] transition-colors font-medium tabular-nums"
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            onClick={() => bumpZoom(0.1)}
            title="Zoom in (Cmd/Ctrl +)"
            className="h-[18px] w-[18px] inline-flex items-center justify-center rounded hover:bg-[var(--tp-bg-3)] hover:text-[var(--tp-t-2)] transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>

          {zoomMenuOpen && (
            <div
              className="absolute bottom-full right-0 mb-1.5 min-w-[140px] rounded-md shadow-lg py-1 z-[60]"
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
                className={`w-full text-left px-3 py-1 text-[11.5px] transition-colors ${
                  lessonZoomMode === "fit"
                    ? "text-[var(--tp-accent)]"
                    : "text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-3)]"
                }`}
              >
                Fit to width
              </button>
              <div className="my-1 h-px mx-2" style={{ background: "var(--tp-b-1)" }} />
              {ZOOM_PRESETS.map((preset) => {
                const active =
                  lessonZoomMode === "fixed" && Math.abs(lessonZoomFixed - preset) < 0.001;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setLessonZoomFixed(preset);
                      setZoomMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1 text-[11.5px] transition-colors tabular-nums ${
                      active
                        ? "text-[var(--tp-accent)]"
                        : "text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-3)]"
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

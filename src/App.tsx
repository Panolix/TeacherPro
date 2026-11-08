import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { SidebarMinimal } from "./components/SidebarMinimal";
import { MainContent } from "./components/MainContent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { runCloseFlushers } from "./utils/closeFlush";
import { finishDocumentClose } from "./utils/closeFlow";
import { useAppStore } from "./store";
import { t as translate } from "./i18n/translations";

const ACCENT_COLORS: Record<string, string> = {
  blue: "#2d86a5",
  emerald: "#059669",
  indigo: "#3b82f6",
  violet: "#a855f7",
  rose: "#e11d48",
  amber: "#d97706",
};

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function normalizeHexColor(value: string): string {
  const trimmed = value.trim();
  const shortHex = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (!shortHex) {
    return trimmed.toLowerCase();
  }

  const [r, g, b] = shortHex[1].split("");
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

function resolveAccentColor(accentValue: string): string {
  if (ACCENT_COLORS[accentValue]) {
    return ACCENT_COLORS[accentValue];
  }

  if (isHexColor(accentValue)) {
    return normalizeHexColor(accentValue);
  }

  return ACCENT_COLORS.blue;
}

function App() {
  const initVault = useAppStore((state) => state.initVault);
  const accentColor = useAppStore((state) => state.accentColor);
  const language = useAppStore((state) => state.language);
  const aiV3ChatModelId = useAppStore((state) => state.aiV3ChatModelId);
  const activeFilePath = useAppStore((state) => state.activeFilePath);
  const documentSaveState = useAppStore((state) => state.documentSaveState);

  useEffect(() => {
    const win = getCurrentWindow();
    
    win.show().then(() => {
      win.setFocus();
    }).catch(err => {
      console.error("Window show() failed:", err);
    });

    initVault().catch(err => {
      console.error("Vault init failed:", err);
    });

    // Fixed canvas modes are enforced by normalizeUiSettings and the data
    // attributes below. Do not persist on startup: doing so can race
    // initVault and overwrite the vault settings backup with defaults.

    // AI v3: no runtime auto-start. The engine is lazy-started on first AI use
    // (see src-tauri/src/ai/engine.rs) — nothing runs until the user needs it.
  }, [initVault]);

  // Keep the backend's remembered model in sync with the device-local UI
  // setting. This does not start the engine; it only makes Auto/token counting
  // resolve to the same model as chat after a restart.
  useEffect(() => {
    void invoke("ai_set_selected_model", { modelId: aiV3ChatModelId ?? null }).catch(
      (err) => {
        console.error("Failed to sync selected AI model:", err);
      },
    );
  }, [aiV3ChatModelId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-tp-theme", "dark");
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Reflect the open document and its dirty state in the native window title.
  useEffect(() => {
    const stem = activeFilePath
      ? (activeFilePath.split(/[\/\\]/).pop() || "").replace(/\.json$/i, "")
      : null;
    const dirty =
      documentSaveState === "dirty" || documentSaveState === "saving";
    const title = stem ? `${dirty ? "● " : ""}${stem} — TeacherPro` : "TeacherPro";
    try {
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => {
          /* not running under Tauri (e.g. browser preview) */
        });
    } catch {
      /* window API unavailable outside Tauri */
    }
  }, [activeFilePath, documentSaveState]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        // Let text fields keep the native paste/spellcheck/correction menu.
        return;
      }
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  useEffect(() => {
    const accent = resolveAccentColor(accentColor);
    document.documentElement.style.setProperty("--tp-accent", accent);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.setAttribute("data-tp-lesson-paper", "light");
    document.documentElement.setAttribute("data-tp-mindmap-paper", "dark");
  }, []);

  // Close coordination with Rust: on a close request Rust prevents the close
  // and emits `app-close-requested`; we flush pending document saves, then
  // confirm. Rust force-closes after its grace period if we never confirm.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    let closing = false;

    void getCurrentWindow()
      .listen("app-close-requested", async () => {
        if (closing) {
          // Repeated native close requests create another watchdog generation.
          await invoke("cancel_close_window").catch(console.error);
          return;
        }
        closing = true;
        try {
          await finishDocumentClose({
            acknowledge: () => invoke("cancel_close_window"),
            flush: runCloseFlushers,
            askDiscard: () => {
              const language = useAppStore.getState().language;
              return ask(translate(language, "statusBar.closeSaveFailed"), {
                title: translate(language, "statusBar.saveFailed"),
                kind: "warning",
                okLabel: translate(language, "common.yes"),
                cancelLabel: translate(language, "common.no"),
              });
            },
            confirm: () => invoke("confirm_close_window"),
          });
        } catch (error) {
          console.error("Close coordination failed:", error);
        } finally {
          closing = false;
        }
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error) => {
        console.error("Could not listen for close requests:", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <div className="tp-app-shell flex h-screen w-screen overflow-hidden bg-[var(--tp-bg-app)] text-[var(--tp-t-2)]">
      <ErrorBoundary panelName="sidebar">
        <SidebarMinimal />
      </ErrorBoundary>
      <ErrorBoundary panelName="content">
        <MainContent />
      </ErrorBoundary>
    </div>
  );
}

export default App;

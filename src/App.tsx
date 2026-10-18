import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SidebarMinimal } from "./components/SidebarMinimal";
import { MainContent } from "./components/MainContent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { runCloseFlushers } from "./utils/closeFlush";
import { useAppStore } from "./store";

const ACCENT_COLORS: Record<string, string> = {
  blue: "#2d86a5",
  emerald: "#059669",
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
  const { initVault, accentColor } = useAppStore();

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

    // Fixed canvas modes: lesson paper is always light, mindmap canvas is always dark.
    useAppStore.getState().setLessonPaperTone("light");
    useAppStore.getState().setMindmapPaperTone("dark");

    // AI v3: no runtime auto-start. The engine is lazy-started on first AI use
    // (see src-tauri/src/ai/engine.rs) — nothing runs until the user needs it.
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-tp-theme", "dark");
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
          return;
        }
        closing = true;
        await runCloseFlushers();
        try {
          await invoke("confirm_close_window");
        } catch (error) {
          // Let a future close request retry the flush/confirm round-trip.
          closing = false;
          console.error("Confirm close failed:", error);
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
    <div className="tp-app-shell flex h-screen w-screen overflow-hidden bg-[#1e1e1e] text-slate-800">
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

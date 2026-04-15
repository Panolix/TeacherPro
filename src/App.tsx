import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
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
  const { initVault, accentColor, lessonPaperTone, mindmapPaperTone } = useAppStore();

  useEffect(() => {
    console.log("App mounted. Attempting to show window immediately...");
    const win = getCurrentWindow();
    
    win.show().then(() => {
      console.log("Window show() succeeded");
      win.setFocus();
    }).catch(err => {
      console.error("Window show() failed:", err);
    });

    initVault().then(() => {
      console.log("Vault initialized");
    }).catch(err => {
      console.error("Vault init failed:", err);
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-tp-theme", "dark");
  }, []);

  useEffect(() => {
    const accent = resolveAccentColor(accentColor);
    document.documentElement.style.setProperty("--tp-accent", accent);
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.setAttribute("data-tp-lesson-paper", lessonPaperTone);
  }, [lessonPaperTone]);

  useEffect(() => {
    document.documentElement.setAttribute("data-tp-mindmap-paper", mindmapPaperTone);
  }, [mindmapPaperTone]);

  return (
    <div className="tp-app-shell flex h-screen w-screen overflow-hidden bg-[#1e1e1e] text-slate-800">
      <Sidebar />
      <MainContent />
    </div>
  );
}

export default App;

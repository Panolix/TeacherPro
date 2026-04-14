import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { useAppStore } from "./store";

const ACCENT_COLORS: Record<string, string> = {
  blue: "#9fd2e4",
  emerald: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
};

function App() {
  const { initVault, themeMode, accentColor } = useAppStore();

  useEffect(() => {
    initVault().finally(() => {
      const win = getCurrentWindow();
      win.show().then(() => win.setFocus());
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-tp-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const accent = ACCENT_COLORS[accentColor] || ACCENT_COLORS.blue;
    document.documentElement.style.setProperty("--tp-accent", accent);
  }, [accentColor]);

  return (
    <div className="tp-app-shell flex h-screen w-screen overflow-hidden bg-[#1e1e1e] text-slate-800">
      <Sidebar />
      <MainContent />
    </div>
  );
}

export default App;

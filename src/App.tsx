import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { useAppStore } from "./store";

function App() {
  const { initVault } = useAppStore();

  useEffect(() => {
    initVault();
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1e1e1e] text-slate-800">
      <Sidebar />
      <MainContent />
    </div>
  );
}

export default App;

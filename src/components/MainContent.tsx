import { FolderOpen } from "lucide-react";
import { useAppStore } from "../store";
import { Editor } from "./Editor";
import { CalendarView } from "./CalendarView";
import { MindmapView } from "./MindmapView";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";

export function MainContent() {
  const { vaultPath, openVault, activeFilePath, currentView } = useAppStore();
  const editorDocumentOpen = currentView === "editor" && !!activeFilePath;

  return (
    <div
      className="tp-main flex-1 flex flex-col h-full print:bg-white relative min-w-0"
      style={{ background: "var(--tp-bg-app)" }}
    >
      {/* Top management bar (sidebar toggle, view tabs, breadcrumb, actions slot) */}
      <TopBar />

      {/* Main Container */}
      <main
        className={`tp-main-scroll flex-1 relative print:overflow-visible ${
          editorDocumentOpen
            ? "overflow-hidden"
            : "overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]"
        }`}
      >
        {!vaultPath ? (
          <div className="text-center mt-20 max-w-xl mx-auto p-8">
            <h1 className="text-4xl font-bold text-gray-100 mb-6">Welcome to TeacherPro</h1>
            <p className="text-gray-400 mb-8 leading-relaxed">
              Start by opening a Vault on your computer. Your Vault is a standard folder where all your lesson plans,
              mindmaps, and materials will be securely organized and stored locally.
            </p>

            <button
              onClick={openVault}
              className="tp-accent-btn text-white px-6 py-2.5 rounded-lg shadow-sm transition-colors font-medium flex items-center gap-2 mx-auto"
            >
              <FolderOpen className="w-5 h-5" />
              Select Vault Folder
            </button>
          </div>
        ) : (
          <>
            {/* Weekly Calendar: default when no file, or when explicitly selected */}
            {(currentView === "calendar" || (!activeFilePath && currentView !== "mindmap")) && (
              <CalendarView />
            )}

            {/* Editor when file is open and editor view */}
            {activeFilePath && currentView === "editor" && (
              <div className="print:p-0 h-full min-h-0">
                <Editor />
              </div>
            )}

            {/* Mindmap view */}
            {currentView === "mindmap" && <MindmapView />}
          </>
        )}
      </main>

      {/* Bottom status bar */}
      <StatusBar />
    </div>
  );
}

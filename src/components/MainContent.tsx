import { ChevronRight, FolderOpen, FilePlus } from "lucide-react";
import { useAppStore } from "../store";
import { Editor } from "./Editor";
import { CalendarView } from "./CalendarView";
import { MindmapView } from "./MindmapView";

export function MainContent() {
  const { vaultPath, openVault, activeFilePath, createNewLesson, currentView } = useAppStore();

  const getFileName = () => {
    if (!activeFilePath) return "Welcome";
    return activeFilePath.split(/[\/\\]/).pop() || "Lesson";
  };

  return (
    <div className="tp-main flex-1 flex flex-col h-full bg-[#1e1e1e] print:bg-white relative">
      {/* Top Title Bar */}
      <header className="tp-main-header h-14 border-b border-[#333333] bg-[#191919] print:hidden flex items-center px-6">
        <div className="flex items-center text-sm text-gray-500">
          <span>Vault</span>
          {vaultPath && (
            <>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span>{vaultPath.split(/[\/\\]/).pop()}</span>
            </>
          )}
          {/* currentView === "editor" or "mindmap" with active file */}
          {(currentView === "editor" || currentView === "mindmap") && activeFilePath && (
            <>
              {(() => {
                let parts = [getFileName()];
                if (vaultPath && activeFilePath.startsWith(vaultPath)) {
                  let rel = activeFilePath.substring(vaultPath.length);
                  if (rel.startsWith("/") || rel.startsWith("\\")) {
                    rel = rel.substring(1);
                  }
                  parts = rel.split(/[\/\\]/);
                }
                return parts.map((part, index) => (
                  <span key={index} className="flex items-center">
                    <ChevronRight className="w-4 h-4 mx-1" />
                    <span className={index === parts.length - 1 ? "text-gray-300 font-medium" : ""}>
                      {part}
                    </span>
                  </span>
                ));
              })()}
            </>
          )}
          {currentView === "calendar" && (
            <>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-gray-300 font-medium">Calendar Weekly View</span>
            </>
          )}
          {currentView === "mindmap" && !activeFilePath && (
            <>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-gray-300 font-medium">Mindmaps</span>
            </>
          )}
          {!vaultPath && (
            <>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-gray-300 font-medium">Welcome</span>
            </>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="tp-main-scroll flex-1 overflow-y-auto relative print:overflow-visible [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]">
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
            {currentView === "editor" && (
              <div className="px-6 pb-6 pt-0 print:p-0">
                {!activeFilePath ? (
                  <div className="text-center mt-20 max-w-xl mx-auto">
                     <h2 className="text-3xl font-bold text-gray-100 mb-4">Workspace Ready</h2>
                     <p className="text-gray-400 mb-8">
                       Select a lesson plan from the sidebar or create a new one to start planning.
                     </p>
                     <button
                      onClick={() => createNewLesson()}
                      className="tp-accent-btn text-white px-6 py-2.5 rounded-lg shadow-sm transition-colors font-medium flex items-center gap-2 mx-auto"
                    >
                      <FilePlus className="w-5 h-5" />
                      Create New Lesson Plan
                    </button>
                  </div>
                ) : (
                  <Editor /> 
                )}
              </div>
            )}
            
            {currentView === "calendar" && <CalendarView />}
            {currentView === "mindmap" && <MindmapView />}
          </>
        )}
      </main>
    </div>
  );
}

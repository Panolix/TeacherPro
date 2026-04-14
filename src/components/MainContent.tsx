import { ChevronRight, FolderOpen } from "lucide-react";
import { useAppStore } from "../store";

export function MainContent() {
  const { vaultPath, openVault } = useAppStore();

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      {/* Top Title Bar */}
      <header className="h-14 border-b border-slate-200 flex items-center px-6">
        <div className="flex items-center text-sm text-slate-500">
          <span>Vault</span>
          <ChevronRight className="w-4 h-4 mx-1" />
          <span className="text-slate-800 font-medium">
            {vaultPath ? vaultPath.split("/").pop() || vaultPath.split("\\").pop() : "Welcome"}
          </span>
        </div>
      </header>

      {/* Editor / Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {!vaultPath ? (
            <div className="text-center mt-20">
              <h1 className="text-4xl font-bold text-slate-800 mb-6">Welcome to TeacherPro</h1>
              <p className="text-slate-600 mb-8 leading-relaxed max-w-xl mx-auto">
                Start by opening a Vault on your computer. Your Vault is a standard folder where all your lesson plans,
                mindmaps, and materials will be securely stored locally.
              </p>

              <button
                onClick={openVault}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-sm transition-colors font-medium flex items-center gap-2 mx-auto"
              >
                <FolderOpen className="w-5 h-5" />
                Select Vault Folder
              </button>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-6">Workspace</h1>
              <p className="text-slate-600">
                Your vault is open at: <code className="bg-slate-100 px-2 py-1 rounded text-sm">{vaultPath}</code>
              </p>
              {/* Future Editor placeholder */}
              <div className="mt-8 border-2 border-dashed border-slate-200 rounded-xl h-96 flex items-center justify-center text-slate-400">
                Select a file from the sidebar or create a new lesson plan.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

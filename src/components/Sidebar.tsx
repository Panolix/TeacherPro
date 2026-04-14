import { FolderOpen, Settings, FileText, PenTool, File } from "lucide-react";
import { useAppStore } from "../store";

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, openVault, vaultPath, vaultContents } = useAppStore();

  return (
    <div
      className={`${
        sidebarOpen ? "w-64" : "w-16"
      } transition-all duration-300 ease-in-out bg-slate-50 border-r border-slate-200 flex flex-col`}
    >
      {/* Sidebar Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200">
        {sidebarOpen && <span className="font-semibold text-slate-700 truncate">TeacherPro</span>}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 hover:bg-slate-200 rounded-md transition-colors"
        >
          <Settings className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      {/* Main Actions */}
      <div className="py-4 border-b border-slate-200">
        <ul className="space-y-1 px-2">
          <li>
            <button
              onClick={openVault}
              className="w-full flex items-center gap-3 px-2 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>{vaultPath ? "Change Vault" : "Open Vault"}</span>}
            </button>
          </li>
          <li>
            <button className="w-full flex items-center gap-3 px-2 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
              <FileText className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Lesson Plans</span>}
            </button>
          </li>
          <li>
            <button className="w-full flex items-center gap-3 px-2 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
              <PenTool className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Mindmaps</span>}
            </button>
          </li>
        </ul>
      </div>

      {/* Vault Contents */}
      {vaultPath && sidebarOpen && (
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Vault Files
          </div>
          <ul className="space-y-1 px-2">
            {vaultContents.map((entry, idx) => (
              <li key={idx}>
                <button className="w-full flex items-center gap-3 px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-md transition-colors text-left truncate">
                  {entry.isDirectory ? (
                    <FolderOpen className="w-4 h-4 shrink-0 text-slate-400" />
                  ) : (
                    <File className="w-4 h-4 shrink-0 text-slate-400" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              </li>
            ))}
            {vaultContents.length === 0 && (
              <div className="px-2 py-2 text-sm text-slate-500 italic">Empty folder</div>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

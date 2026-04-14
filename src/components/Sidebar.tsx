import { FolderOpen, Settings, PenTool, File, Plus, PanelLeftClose, PanelLeft, Calendar } from "lucide-react";
import { useAppStore } from "../store";
import { MiniCalendar } from "./MiniCalendar";

export function Sidebar() {
  const { 
    sidebarOpen, 
    setSidebarOpen, 
    openVault, 
    vaultPath, 
    lessonPlans,
    mindmaps,
    createNewLesson,
    openLesson,
    activeFilePath,
    currentView,
    setCurrentView,
    openMindmap,
    createNewMindmap,
    materials
  } = useAppStore();

  const handleDragStart = (e: React.DragEvent, fileName: string) => {
    e.dataTransfer.setData("application/teacherpro-file", fileName);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className={`print:hidden ${
        sidebarOpen ? "w-64" : "w-16"
      } transition-all duration-300 ease-in-out bg-[#191919] border-r border-[#333333] flex flex-col`}
    >
      {/* Sidebar Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-[#333333]">
        {sidebarOpen && <span className="font-semibold text-gray-200 truncate">TeacherPro</span>}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 hover:bg-[#2d2d2d] rounded-md transition-colors"
        >
          {sidebarOpen ? <PanelLeftClose className="w-5 h-5 text-gray-400" /> : <PanelLeft className="w-5 h-5 text-gray-400" />}
        </button>
      </div>

      {/* Main Actions */}
      <div className="py-4 border-b border-[#333333]">
        <ul className="space-y-1 px-2">
          <li>
            <button
              onClick={openVault}
              className="w-full flex items-center gap-3 px-2 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] rounded-md transition-colors"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>{vaultPath ? "Change Vault" : "Open Vault"}</span>}
            </button>
          </li>
          {vaultPath && (
            <li>
              <button 
                onClick={() => createNewLesson()}
                className="w-full flex items-center gap-3 px-2 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-[#2d2d2d] rounded-md transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>New Lesson Plan</span>}
              </button>
            </li>
          )}
          <li>
            <button 
              onClick={() => setCurrentView("calendar")}
              className={`w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${currentView === "calendar" ? "bg-[#2d2d2d] text-white" : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"}`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Calendar Weekly View</span>}
            </button>
          </li>
          <li>
            <button 
              onClick={() => setCurrentView("mindmap")}
              className={`w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${currentView === "mindmap" ? "bg-[#2d2d2d] text-white" : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"}`}
            >
              <PenTool className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Mindmaps</span>}
            </button>
          </li>
        </ul>
      </div>

      <MiniCalendar />

      {/* Vault Contents */}
      {vaultPath && sidebarOpen && (
        <div className="flex-1 overflow-y-auto py-2">
          
          {/* Lesson Plans Section */}
          <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">
            Lesson Plans
          </div>
          <ul className="space-y-1 px-2 mb-6">
            {lessonPlans.map((entry, idx) => {
              const isActive = activeFilePath?.endsWith(entry.name);
              return (
                <li key={`lp-${idx}`}>
                  <button 
                    onClick={() => {
                      if (!entry.isDirectory) {
                        openLesson(entry.name);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md transition-colors text-left truncate ${
                      isActive && currentView === "editor"
                        ? "bg-[#2d2d2d] text-white" 
                        : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                    }`}
                  >
                    {entry.isDirectory ? (
                      <FolderOpen className="w-4 h-4 shrink-0 text-gray-500" />
                    ) : (
                      <File className={`w-4 h-4 shrink-0 ${isActive && currentView === "editor" ? "text-blue-400" : "text-gray-500"}`} />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                </li>
              );
            })}
            {lessonPlans.length === 0 && (
              <div className="px-2 py-2 text-sm text-gray-500 italic">No plans yet</div>
            )}
          </ul>

          {/* Mindmaps Section */}
          <div className="px-4 flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            <span>Mindmaps</span>
            {vaultPath && (
              <button onClick={() => createNewMindmap()} className="hover:text-gray-300 p-1">
                 <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
          <ul className="space-y-1 px-2">
            {mindmaps.map((entry, idx) => {
              const isActive = activeFilePath?.endsWith(entry.name);
              return (
              <li key={`mm-${idx}`}>
                <button 
                  onClick={() => !entry.isDirectory && openMindmap(entry.name)}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md transition-colors text-left truncate ${
                    isActive && currentView === "mindmap" 
                      ? "bg-[#2d2d2d] text-white" 
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                  }`}
                >
                  {entry.isDirectory ? (
                    <FolderOpen className="w-4 h-4 shrink-0 text-gray-500" />
                  ) : (
                    <File className={`w-4 h-4 shrink-0 ${isActive && currentView === "mindmap" ? "text-blue-400" : "text-gray-500"}`} />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              </li>
            )})}
            {mindmaps.length === 0 && (
              <div className="px-2 py-2 text-sm text-gray-500 italic">No mindmaps yet</div>
            )}
          </ul>

          {/* Materials Section */}
          <div className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-6">
            Materials
          </div>
          <ul className="space-y-1 px-2 pb-8">
            {materials.map((entry, idx) => (
              <li key={`mat-${idx}`}>
                <button 
                  draggable={!entry.isDirectory}
                  onDragStart={(e) => !entry.isDirectory && handleDragStart(e, entry.name!)}
                  className="w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md transition-colors text-left truncate text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] cursor-grab active:cursor-grabbing"
                >
                  {entry.isDirectory ? (
                    <FolderOpen className="w-4 h-4 shrink-0 text-gray-500" />
                  ) : (
                    <File className="w-4 h-4 shrink-0 text-gray-500" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              </li>
            ))}
            {materials.length === 0 && (
              <div className="px-2 py-2 text-sm text-gray-500 italic">Empty folder</div>
            )}
          </ul>

        </div>
      )}

      {/* Bottom Settings */}
      <div className="mt-auto p-4 border-t border-[#333333]">
        <button className="w-full flex items-center gap-3 px-2 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] rounded-md transition-colors">
          <Settings className="w-4 h-4 shrink-0" />
          {sidebarOpen && <span>Settings</span>}
        </button>
      </div>
    </div>
  );
}

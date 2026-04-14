import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Settings,
  File,
  Plus,
  PanelLeftClose,
  PanelLeft,
  Calendar,
  ChevronRight,
  ChevronDown,
  Folder,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Sun,
  Moon,
  Palette,
  Bug,
  PanelTopClose,
  PanelTopOpen,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { AccentColor, ThemeMode, useAppStore } from "../store";
import { MiniCalendar } from "./MiniCalendar";

type SidebarMenuTarget =
  | { kind: "lesson"; fileName: string }
  | { kind: "mindmap"; fileName: string }
  | { kind: "material"; relativePath: string; isDirectory: boolean };

interface SidebarMenuState {
  x: number;
  y: number;
  target: SidebarMenuTarget;
}

type MaterialPreviewKind = "pdf" | "image" | "text" | "error";

interface MaterialPreviewState {
  title: string;
  kind: MaterialPreviewKind;
  src?: string;
  text?: string;
  message?: string;
  blobUrl?: string;
}

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: "blue", label: "Blue", color: "#2563eb" },
  { value: "emerald", label: "Emerald", color: "#059669" },
  { value: "rose", label: "Rose", color: "#e11d48" },
  { value: "amber", label: "Amber", color: "#d97706" },
];

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
];

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
    deleteLesson,
    renameLesson,
    activeFilePath,
    currentView,
    setCurrentView,
    openMindmap,
    deleteMindmap,
    renameMindmap,
    createNewMindmap,
    materials,
    addMaterialFiles,
    addMaterialDirectory,
    deleteMaterialEntry,
    renameMaterialEntry,
    themeMode,
    accentColor,
    setThemeMode,
    setAccentColor,
    calendarCollapsed,
    setCalendarCollapsed,
    sectionCollapsed,
    toggleSectionCollapsed,
    setDraggedMaterial,
    setPendingMaterialDrop,
    debugMode,
    setDebugMode,
    debugEvents,
    logDebug,
    clearDebugEvents,
  } = useAppStore();

  const [expandedMaterialFolders, setExpandedMaterialFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [materialPreview, setMaterialPreview] = useState<MaterialPreviewState | null>(null);
  const materialPreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (materialPreview?.blobUrl) {
        URL.revokeObjectURL(materialPreview.blobUrl);
      }
    };
  }, [materialPreview]);

  const setPreviewState = (next: MaterialPreviewState | null) => {
    setMaterialPreview((previous) => {
      if (previous?.blobUrl) {
        URL.revokeObjectURL(previous.blobUrl);
      }
      return next;
    });
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setPreviewState(null);
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onEscape, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onEscape, true);
    };
  }, []);

  useEffect(() => {
    if (!materialPreview) {
      return;
    }

    requestAnimationFrame(() => {
      materialPreviewRef.current?.focus();
    });
  }, [materialPreview]);

  const handleDragStart = (e: React.DragEvent, relativePath: string, isDirectory: boolean) => {
    const payload = JSON.stringify({ relativePath, isDirectory });
    logDebug("sidebar", "drag-start", `${relativePath} (${isDirectory ? "folder" : "file"})`);
    setDraggedMaterial({ relativePath, isDirectory });
    e.dataTransfer.setData("application/teacherpro-material", payload);
    e.dataTransfer.setData("application/teacherpro-file", relativePath);
    e.dataTransfer.setData("text/plain", relativePath);
    e.dataTransfer.setData("text", relativePath);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragEnd = (e: React.DragEvent, relativePath: string, isDirectory: boolean) => {
    const dropEffect = e.dataTransfer?.dropEffect || "none";
    const activeDrag = useAppStore.getState().draggedMaterial;
    const dragStillActive =
      !!activeDrag &&
      activeDrag.relativePath === relativePath &&
      activeDrag.isDirectory === isDirectory;

    logDebug(
      "sidebar",
      "drag-end",
      `${relativePath} (${isDirectory ? "folder" : "file"}) | effect=${dropEffect} | active=${String(dragStillActive)} | x=${e.clientX},y=${e.clientY}`,
    );

    // Some WebView setups swallow drop events even with dropEffect="copy".
    // Queue a fallback only if this drag is still active, meaning no handler consumed it.
    if (dragStillActive && e.clientX > 0 && e.clientY > 0) {
      setPendingMaterialDrop({
        relativePath,
        isDirectory,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      logDebug("sidebar", "drag-end-fallback-queued", relativePath);
    }

    // Always clear drag state at the end of drag gesture.
    setDraggedMaterial(null);
  };

  const toggleFolder = (relativePath: string) => {
    setExpandedMaterialFolders((previous) => ({
      ...previous,
      [relativePath]: !previous[relativePath],
    }));
  };

  const queueMaterialInsertAtCursor = (relativePath: string, isDirectory: boolean) => {
    if (currentView !== "editor" || !activeFilePath) {
      logDebug(
        "sidebar",
        "double-click-ignored",
        `${relativePath} (${isDirectory ? "folder" : "file"}) | view=${currentView}`,
      );
      return;
    }

    setPendingMaterialDrop({
      relativePath,
      isDirectory,
      clientX: -1,
      clientY: -1,
    });
    setDraggedMaterial(null);
    logDebug(
      "sidebar",
      "double-click-queue",
      `${relativePath} (${isDirectory ? "folder" : "file"})`,
    );
  };

  const handleItemContextMenu = (
    event: React.MouseEvent,
    target: SidebarMenuTarget,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const estimatedWidth = 210;
    const estimatedItemCount =
      target.kind === "material"
        ? target.isDirectory
          ? 4
          : 5
        : 3;
    const estimatedHeight = estimatedItemCount * 36 + 12;
    const padding = 8;

    const x = Math.max(
      padding,
      Math.min(event.clientX, window.innerWidth - estimatedWidth - padding),
    );
    const y = Math.max(
      padding,
      Math.min(event.clientY, window.innerHeight - estimatedHeight - padding),
    );

    setContextMenu({ x, y, target });
  };

  const handleOpenFromMenu = async () => {
    if (!contextMenu) return;

    const target = contextMenu.target;
    setContextMenu(null);

    if (target.kind === "lesson") {
      await openLesson(target.fileName);
      return;
    }

    if (target.kind === "mindmap") {
      await openMindmap(target.fileName);
      return;
    }

    if (!vaultPath) {
      return;
    }

    try {
      const absolutePath = await join(vaultPath, "Materials", ...target.relativePath.split("/").filter(Boolean));
      const isPresent = await exists(absolutePath);
      logDebug("sidebar", "open-check", `${target.relativePath} | exists=${String(isPresent)} | path=${absolutePath}`);
      if (!isPresent) {
        alert(`Material path not found: ${target.relativePath}`);
        return;
      }
      await invoke("open_file_in_default_app", { path: absolutePath });
      logDebug("sidebar", "open-success", target.relativePath);
    } catch (error) {
      console.error("Failed to open material", error);
      logDebug("sidebar", "open-error", String(error));
      alert("Could not open this material item in the default app.");
    }
  };

  const handleRevealFromMenu = async () => {
    if (!contextMenu || contextMenu.target.kind !== "material" || !vaultPath) return;

    const target = contextMenu.target;
    setContextMenu(null);

    try {
      const absolutePath = await join(vaultPath, "Materials", ...target.relativePath.split("/").filter(Boolean));
      const isPresent = await exists(absolutePath);
      logDebug("sidebar", "reveal-check", `${target.relativePath} | exists=${String(isPresent)} | path=${absolutePath}`);
      if (!isPresent) {
        alert(`Material path not found: ${target.relativePath}`);
        return;
      }
      await revealItemInDir(absolutePath);
      logDebug("sidebar", "reveal-success", target.relativePath);
    } catch (error) {
      console.error("Failed to reveal material", error);
      logDebug("sidebar", "reveal-error", String(error));
      alert("Could not reveal this item in your file manager.");
    }
  };

  const handlePreviewFromMenu = async () => {
    if (!contextMenu || contextMenu.target.kind !== "material" || !vaultPath) return;

    const target = contextMenu.target;
    setContextMenu(null);

    if (target.isDirectory) {
      logDebug("sidebar", "preview-skip", `${target.relativePath} is directory`);
      setPreviewState({
        title: target.relativePath,
        kind: "error",
        message: "Folder preview is not available. Use Open or Reveal In File Manager.",
      });
      return;
    }

    const fileName = target.relativePath.split("/").pop() || target.relativePath;
    const extension = (fileName.split(".").pop() || "").toLowerCase();

    try {
      const absolutePath = await join(vaultPath, "Materials", ...target.relativePath.split("/").filter(Boolean));
      const isPresent = await exists(absolutePath);
      logDebug("sidebar", "preview-check", `${target.relativePath} | exists=${String(isPresent)} | ext=${extension} | path=${absolutePath}`);
      if (!isPresent) {
        setPreviewState({
          title: fileName,
          kind: "error",
          message: `Material path not found: ${target.relativePath}`,
        });
        return;
      }

      if (extension === "pdf") {
        const bytes = await readFile(absolutePath);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        logDebug("sidebar", "preview-pdf-success", `${target.relativePath} | bytes=${bytes.length}`);
        setPreviewState({
          title: fileName,
          kind: "pdf",
          src: blobUrl,
          blobUrl,
        });
        return;
      }

      if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
        logDebug("sidebar", "preview-image-success", target.relativePath);
        setPreviewState({
          title: fileName,
          kind: "image",
          src: convertFileSrc(absolutePath),
        });
        return;
      }

      if (["txt", "md", "json", "csv", "log", "js", "jsx", "ts", "tsx", "html", "css"].includes(extension)) {
        const text = await readTextFile(absolutePath);
        logDebug("sidebar", "preview-text-success", `${target.relativePath} | chars=${text.length}`);
        setPreviewState({
          title: fileName,
          kind: "text",
          text,
        });
        return;
      }

      setPreviewState({
        title: fileName,
        kind: "error",
        message: "Preview is not available for this file type.",
      });
      logDebug("sidebar", "preview-unsupported", `${target.relativePath} | ext=${extension}`);
    } catch (error) {
      console.error("Failed to preview material", error);
      logDebug("sidebar", "preview-error", String(error));
      setPreviewState({
        title: fileName,
        kind: "error",
        message: "Could not load a preview for this item.",
      });
    }
  };

  const handleDeleteFromMenu = async () => {
    if (!contextMenu) return;

    const target = contextMenu.target;
    setContextMenu(null);

    if (target.kind === "lesson") {
      if (confirm(`Delete lesson plan \"${target.fileName}\"?`)) {
        await deleteLesson(target.fileName);
      }
      return;
    }

    if (target.kind === "mindmap") {
      if (confirm(`Delete mindmap \"${target.fileName}\"?`)) {
        await deleteMindmap(target.fileName);
      }
      return;
    }

    const label = target.isDirectory ? "folder" : "file";
    if (confirm(`Delete material ${label} \"${target.relativePath}\"?`)) {
      await deleteMaterialEntry(target.relativePath, target.isDirectory);
    }
  };

  const handleRenameFromMenu = async () => {
    if (!contextMenu) return;

    const target = contextMenu.target;
    setContextMenu(null);

    if (target.kind === "lesson") {
      const currentName = target.fileName.replace(/\.json$/i, "");
      const nextName = prompt("Rename lesson plan", currentName);
      if (!nextName) return;
      await renameLesson(target.fileName, nextName);
      return;
    }

    if (target.kind === "mindmap") {
      const currentName = target.fileName.replace(/\.json$/i, "");
      const nextName = prompt("Rename mindmap", currentName);
      if (!nextName) return;
      await renameMindmap(target.fileName, nextName);
      return;
    }

    const currentName = target.relativePath.split("/").pop() || target.relativePath;
    const nextName = prompt("Rename material item", currentName);
    if (!nextName) return;
    await renameMaterialEntry(target.relativePath, nextName);
  };

  const visibleMaterials = useMemo(() => materials, [materials]);

  const handleSettingsClick = () => {
    if (!sidebarOpen) {
      setSidebarOpen(true);
      setSettingsOpen(true);
      return;
    }
    setSettingsOpen((previous) => !previous);
  };

  const handleCopyDebugLog = async () => {
    const lines = debugEvents
      .slice()
      .reverse()
      .map((entry) => `${entry.timestamp} | ${entry.source} | ${entry.action}${entry.detail ? ` | ${entry.detail}` : ""}`);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      alert("Debug log copied to clipboard.");
    } catch {
      alert("Could not copy to clipboard on this system.");
    }
  };

  const renderSectionHeader = ({
    title,
    collapsed,
    onToggle,
    actions,
    marginTop = "",
  }: {
    title: string;
    collapsed: boolean;
    onToggle: () => void;
    actions?: ReactNode;
    marginTop?: string;
  }) => (
    <div className={`px-4 flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 ${marginTop}`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-left hover:text-gray-300 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <span>{title}</span>
      </button>
      {actions}
    </div>
  );

  const renderMaterialEntries = (entries: typeof materials, depth = 0) =>
    entries.map((entry) => {
      const isExpanded = !!expandedMaterialFolders[entry.relativePath];
      const hasChildren = entry.isDirectory && entry.children.length > 0;

      return (
        <li key={entry.relativePath}>
          <button
            draggable
            onDragStart={(event) => handleDragStart(event, entry.relativePath, entry.isDirectory)}
            onDragEnd={(event) => handleDragEnd(event, entry.relativePath, entry.isDirectory)}
            onClick={() => entry.isDirectory && toggleFolder(entry.relativePath)}
            onDoubleClick={() => queueMaterialInsertAtCursor(entry.relativePath, entry.isDirectory)}
            onContextMenu={(event) =>
              handleItemContextMenu(event, {
                kind: "material",
                relativePath: entry.relativePath,
                isDirectory: entry.isDirectory,
              })
            }
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left truncate text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            title={entry.relativePath}
          >
            {entry.isDirectory ? (
              <>
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 shrink-0 text-gray-500" />
                ) : (
                  <Folder className="w-4 h-4 shrink-0 text-gray-500" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5 h-3.5 shrink-0" />
                <File className="w-4 h-4 shrink-0 text-gray-500" />
              </>
            )}
            <span className="truncate">{entry.name}</span>
          </button>

          {entry.isDirectory && isExpanded && hasChildren && (
            <ul className="space-y-0.5">{renderMaterialEntries(entry.children, depth + 1)}</ul>
          )}
        </li>
      );
    });

  return (
    <div
      className={`print:hidden ${
        sidebarOpen ? "w-64" : "w-16"
      } transition-all duration-300 ease-in-out bg-[#191919] border-r border-[#333333] flex flex-col relative tp-sidebar`}
    >
      {/* Sidebar Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-[#333333]">
        {sidebarOpen && <span className="font-semibold text-gray-200 truncate">TeacherPro</span>}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1 hover:bg-[#2d2d2d] rounded-md transition-colors"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5 text-gray-400" />
          ) : (
            <PanelLeft className="w-5 h-5 text-gray-400" />
          )}
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
                className="w-full flex items-center gap-3 px-2 py-2 text-sm text-[var(--tp-accent)] hover:opacity-90 hover:bg-[#2d2d2d] rounded-md transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>New Lesson Plan</span>}
              </button>
            </li>
          )}
          {vaultPath && (
            <li>
              <button
                onClick={() => createNewMindmap()}
                className="w-full flex items-center gap-3 px-2 py-2 text-sm text-[var(--tp-accent)] hover:opacity-90 hover:bg-[#2d2d2d] rounded-md transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                {sidebarOpen && <span>New Mindmap</span>}
              </button>
            </li>
          )}
          <li>
            <button
              onClick={() => setCurrentView("calendar")}
              className={`w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${
                currentView === "calendar"
                  ? "bg-[#2d2d2d] text-white"
                  : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Calendar Weekly View</span>}
            </button>
          </li>
        </ul>
      </div>

      {sidebarOpen && vaultPath && (
        <div className="px-3 pt-2 border-b border-[#333333] pb-2">
          <button
            onClick={() => setCalendarCollapsed(!calendarCollapsed)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] rounded-md transition-colors"
          >
            <span className="uppercase tracking-wider font-semibold">Mini Calendar</span>
            {calendarCollapsed ? (
              <PanelTopOpen className="w-3.5 h-3.5" />
            ) : (
              <PanelTopClose className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {vaultPath && !calendarCollapsed && <MiniCalendar />}

      {/* Vault Contents */}
      {vaultPath && sidebarOpen && (
        <div className="flex-1 overflow-y-auto py-2">
          {/* Lesson Plans Section */}
          {renderSectionHeader({
            title: "Lesson Plans",
            collapsed: sectionCollapsed.lessonPlans,
            onToggle: () => toggleSectionCollapsed("lessonPlans"),
            actions: vaultPath ? (
              <button onClick={() => createNewLesson()} className="hover:text-gray-300 p-1" title="New lesson plan">
                <Plus className="w-3 h-3" />
              </button>
            ) : null,
            marginTop: "mt-4",
          })}
          {!sectionCollapsed.lessonPlans && (
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
                      onContextMenu={(event) =>
                        !entry.isDirectory &&
                        handleItemContextMenu(event, { kind: "lesson", fileName: entry.name })
                      }
                      className={`w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md transition-colors text-left truncate ${
                        isActive && currentView === "editor"
                          ? "bg-[#2d2d2d] text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                      }`}
                    >
                      {entry.isDirectory ? (
                        <FolderOpen className="w-4 h-4 shrink-0 text-gray-500" />
                      ) : (
                        <File
                          className={`w-4 h-4 shrink-0 ${
                            isActive && currentView === "editor"
                              ? "text-[var(--tp-accent)]"
                              : "text-gray-500"
                          }`}
                        />
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
          )}

          {/* Mindmaps Section */}
          {renderSectionHeader({
            title: "Mindmaps",
            collapsed: sectionCollapsed.mindmaps,
            onToggle: () => toggleSectionCollapsed("mindmaps"),
            actions: vaultPath ? (
              <button onClick={() => createNewMindmap()} className="hover:text-gray-300 p-1">
                <Plus className="w-3 h-3" />
              </button>
            ) : null,
          })}
          {!sectionCollapsed.mindmaps && (
            <ul className="space-y-1 px-2">
              {mindmaps.map((entry, idx) => {
                const isActive = activeFilePath?.endsWith(entry.name);
                return (
                  <li key={`mm-${idx}`}>
                    <button
                      onClick={() => !entry.isDirectory && openMindmap(entry.name)}
                      onContextMenu={(event) =>
                        !entry.isDirectory &&
                        handleItemContextMenu(event, { kind: "mindmap", fileName: entry.name })
                      }
                      className={`w-full flex items-center gap-3 px-2 py-1.5 text-sm rounded-md transition-colors text-left truncate ${
                        isActive && currentView === "mindmap"
                          ? "bg-[#2d2d2d] text-white"
                          : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                      }`}
                    >
                      {entry.isDirectory ? (
                        <FolderOpen className="w-4 h-4 shrink-0 text-gray-500" />
                      ) : (
                        <File
                          className={`w-4 h-4 shrink-0 ${
                            isActive && currentView === "mindmap"
                              ? "text-[var(--tp-accent)]"
                              : "text-gray-500"
                          }`}
                        />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </button>
                  </li>
                );
              })}
              {mindmaps.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">No mindmaps yet</div>
              )}
            </ul>
          )}

          {/* Materials Section */}
          {renderSectionHeader({
            title: "Materials",
            collapsed: sectionCollapsed.materials,
            onToggle: () => toggleSectionCollapsed("materials"),
            actions: (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => addMaterialFiles()}
                  title="Add files"
                  className="hover:text-gray-300 p-1"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => addMaterialDirectory()}
                  title="Add folder"
                  className="hover:text-gray-300 p-1"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
            marginTop: "mt-6",
          })}
          {!sectionCollapsed.materials && (
            <ul className="space-y-1 px-2 pb-8">
              {renderMaterialEntries(visibleMaterials)}
              {visibleMaterials.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">Empty folder</div>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Bottom Settings */}
      <div className="mt-auto p-4 border-t border-[#333333]">
        <button
          onClick={handleSettingsClick}
          className={`w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md transition-colors ${
            settingsOpen
              ? "bg-[#2d2d2d] text-white"
              : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {sidebarOpen && <span>Settings</span>}
        </button>
      </div>

      {settingsOpen && sidebarOpen && (
        <div className="absolute bottom-20 left-3 right-3 z-50 rounded-xl border border-[#343434] bg-[#181818] p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-200">Appearance</h3>
            <button
              onClick={() => setSettingsOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              Close
            </button>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 mb-2">
              <Palette className="w-3.5 h-3.5" /> Theme
            </div>
            <div className="grid grid-cols-2 gap-2">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = themeMode === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setThemeMode(option.value)}
                    className={`flex items-center justify-center gap-2 px-2 py-2 rounded-md text-sm border transition-colors ${
                      isActive
                        ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                        : "border-[#333] text-gray-300 hover:bg-[#222]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Accent Color</div>
            <div className="grid grid-cols-4 gap-2">
              {ACCENT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setAccentColor(option.value)}
                  title={option.label}
                  className={`h-8 rounded-md border transition-transform ${
                    accentColor === option.value
                      ? "border-white scale-[1.04]"
                      : "border-[#333] hover:scale-[1.03]"
                  }`}
                  style={{ backgroundColor: option.color }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#2d2d2d]">
            <button
              onClick={() => {
                const next = !debugMode;
                setDebugMode(next);
                if (next) {
                  logDebug("debug", "enabled", "Runtime diagnostics ON");
                }
              }}
              className={`w-full flex items-center justify-between px-2 py-2 rounded-md text-sm border transition-colors ${
                debugMode
                  ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                  : "border-[#333] text-gray-300 hover:bg-[#222]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Bug className="w-4 h-4" /> Debug Mode
              </span>
              <span className="text-xs uppercase tracking-wider">{debugMode ? "On" : "Off"}</span>
            </button>
          </div>
        </div>
      )}

      {debugMode && sidebarOpen && (
        <div className={`absolute ${settingsOpen ? "bottom-[18rem]" : "bottom-24"} left-3 right-3 z-[55] rounded-lg border border-[#3a3a3a] bg-[#141414] p-2 shadow-xl`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-300">Debug Console</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  logDebug("debug", "disabled", "Runtime diagnostics OFF");
                  setDebugMode(false);
                }}
                className="text-[11px] text-amber-300 hover:text-amber-200"
              >
                Disable
              </button>
              <button onClick={handleCopyDebugLog} className="text-[11px] text-gray-300 hover:text-white">Copy</button>
              <button
                onClick={() => {
                  clearDebugEvents();
                  logDebug("debug", "cleared", "Console cleared");
                }}
                className="text-[11px] text-gray-300 hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {debugEvents.length === 0 && (
              <div className="text-[11px] text-gray-500">No events yet. Drag a material or use Preview/Open.</div>
            )}
            {debugEvents.map((entry) => (
              <div key={entry.id} className="text-[11px] leading-snug text-gray-300 border-b border-[#222] pb-1">
                <span className="text-gray-500">{entry.timestamp}</span> {entry.source}:{entry.action}
                {entry.detail ? <span className="text-gray-400"> | {entry.detail}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-[60] min-w-[170px] rounded-md border border-[#3a3a3a] bg-[#1f1f1f] p-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.target.kind !== "material" ? (
            <button
              onClick={handleOpenFromMenu}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
            >
              Open
            </button>
          ) : (
            <>
              {!contextMenu.target.isDirectory && (
                <button
                  onClick={handlePreviewFromMenu}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
                >
                  Preview
                </button>
              )}
              <button
                onClick={handleOpenFromMenu}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
              >
                Open
              </button>
              <button
                onClick={handleRevealFromMenu}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
              >
                Reveal In File Manager
              </button>
            </>
          )}
          <button
            onClick={handleRenameFromMenu}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
          >
            <Pencil className="w-3.5 h-3.5" /> Rename
          </button>
          <button
            onClick={handleDeleteFromMenu}
            className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      {materialPreview && (
        <div
          className="fixed inset-0 z-[75] bg-black/60 flex items-center justify-center p-6"
          onClick={() => setPreviewState(null)}
        >
          <div
            ref={materialPreviewRef}
            tabIndex={-1}
            className="w-full max-w-5xl max-h-[88vh] bg-[#151515] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-11 border-b border-[#333] px-4 flex items-center justify-between">
              <div className="text-sm text-gray-200 font-medium truncate">{materialPreview.title}</div>
              <button
                onClick={() => setPreviewState(null)}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-[#232323] rounded"
              >
                Close
              </button>
            </div>

            <div className="p-4 h-[calc(88vh-44px)] overflow-auto">
              {materialPreview.kind === "error" && (
                <div className="text-sm text-red-300">{materialPreview.message}</div>
              )}

              {materialPreview.kind === "pdf" && materialPreview.src && (
                <iframe src={materialPreview.src} className="w-full h-full min-h-[70vh] rounded-md bg-white" title={materialPreview.title} />
              )}

              {materialPreview.kind === "image" && materialPreview.src && (
                <div className="w-full h-full flex items-center justify-center">
                  <img src={materialPreview.src} alt={materialPreview.title} className="max-w-full max-h-[72vh] object-contain rounded-md" />
                </div>
              )}

              {materialPreview.kind === "text" && (
                <pre className="whitespace-pre-wrap break-words text-sm text-gray-200 leading-relaxed bg-[#101010] border border-[#2d2d2d] rounded-md p-4">
                  {materialPreview.text || "(Empty file)"}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

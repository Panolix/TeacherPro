import { useState, useCallback, useMemo, useRef } from "react";
import { GripVertical } from "lucide-react";
import {
  FolderOpen,
  Settings,
  FileText,
  Network,
  Calendar,
  Search,
  Clock,
  ChevronLeft,
  FolderPlus,
  ChevronRight,
  X,
  Pencil,
  Copy,
  Trash2,
  Move,
  Plus,
  Trash,
  RotateCcw,
} from "lucide-react";
import { Eye, ExternalLink, FolderOpen as FolderRevealIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { useAppStore, type MaterialEntry, type VaultRoot } from "../store";
import { MiniCalendar } from "./MiniCalendar";
import { SettingsModal } from "./SettingsModal";
import { ContextMenu, useContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { MaterialPreviewModal } from "./MaterialPreviewModal";
import { VaultItemPreviewModal } from "./VaultItemPreviewModal";

// Types for panel switching
type PanelType = "explorer" | "search" | "recent" | "calendar" | "trash";

// Icons for file types
const LessonIcon = () => (
  <svg className="w-4 h-4 shrink-0 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);

const MindmapIcon = () => (
  <svg className="w-4 h-4 shrink-0 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v4M12 18v4"/>
  </svg>
);

const FolderIcon = ({ expanded }: { expanded?: boolean }) => (
  expanded ? (
    <svg className="w-4 h-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ) : (
    <svg className="w-4 h-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
    </svg>
  )
);

export function SidebarMinimal() {
  const {
    vaultPath,
    lessonTree,
    mindmapTree,
    openLesson,
    openMindmap,
    createNewLesson,
    createNewMindmap,
    createVaultFolder,
    activeFilePath,
    expandedMaterialFolders,
    setExpandedMaterialFolders,
    renameVaultPath,
    moveVaultPath,
    deleteVaultPath,
    duplicateVaultPath,
    recents,
    clearRecents,
    trashEntries,
    restoreTrashEntry,
    permanentlyDeleteTrashEntry,
    materials,
    addMaterialFiles,
    addMaterialDirectory,
    deleteMaterialEntry,
    renameMaterialEntry,
    setDraggedMaterial,
    setPendingMaterialDrop,
    currentView,
  } = useAppStore();

  // Panel state
  const [pushPanelOpen, setPushPanelOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<PanelType>("explorer");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedTrashSections, setExpandedTrashSections] = useState<Record<string, boolean>>({});
  const [expandedMaterials, setExpandedMaterials] = useState<Record<string, boolean>>({});
  const [materialsImportBusy, setMaterialsImportBusy] = useState(false);
  const [renameModal, setRenameModal] = useState<{
    roots: VaultRoot[]; // apply rename to each root that contains this path
    relativePath: string;
    currentName: string;
    isDirectory: boolean;
  } | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  // Fallback for WKWebView/Safari: custom MIME types are stripped from dataTransfer in drop events
  const vaultDragPayloadRef = useRef<{ root: VaultRoot; relativePath: string } | null>(null);

  /**
   * Mouse-based drag for sidebar file items → folder drop targets.
   * HTML5 dragstart on div elements is unreliable in WKWebView (Tauri/macOS).
   */
  const startSidebarMouseDrag = useCallback((
    e: React.MouseEvent,
    root: VaultRoot,
    relativePath: string,
    label: string,
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let ghost: HTMLDivElement | null = null;

    const findFolderPathAtPoint = (x: number, y: number): string | null => {
      const els = document.querySelectorAll<HTMLElement>('[data-folder-path]');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return el.getAttribute('data-folder-path');
        }
      }
      return null;
    };

    const isInExplorerPanel = (x: number, y: number): boolean => {
      const panel = document.querySelector<HTMLElement>('[data-explorer-panel]');
      if (!panel) return false;
      const r = panel.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.sqrt(dx * dx + dy * dy) > 5) {
        dragging = true;
        vaultDragPayloadRef.current = { root, relativePath };
        ghost = document.createElement('div');
        Object.assign(ghost.style, {
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: '9999',
          background: 'var(--tp-bg-3, #2a2a2a)',
          border: '2px solid var(--tp-accent, #2d86a5)',
          borderRadius: '6px',
          padding: '4px 10px',
          fontSize: '12px',
          fontWeight: '600',
          color: 'var(--tp-t-1, #fff)',
          whiteSpace: 'nowrap',
          boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
          opacity: '0.95',
          userSelect: 'none',
        });
        ghost.textContent = label;
        document.body.appendChild(ghost);
      }

      if (dragging && ghost) {
        ghost.style.left = `${ev.clientX + 14}px`;
        ghost.style.top = `${ev.clientY - 10}px`;
        const hovered = findFolderPathAtPoint(ev.clientX, ev.clientY);
        setDragOverFolder(hovered ? `unified:d:${hovered}:` : null);
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (ghost) { ghost.remove(); ghost = null; }
      setDragOverFolder(null);

      const payload = vaultDragPayloadRef.current;
      vaultDragPayloadRef.current = null;
      if (!dragging || !payload) return;

      const targetFolder = findFolderPathAtPoint(ev.clientX, ev.clientY);
      if (targetFolder !== null) {
        // targetFolder is a subfolder path
        moveVaultPath(payload.root, payload.relativePath, targetFolder);
      } else if (isInExplorerPanel(ev.clientX, ev.clientY)) {
        // Dropped in the sidebar but not on any folder row → move to root
        moveVaultPath(payload.root, payload.relativePath, "");
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [moveVaultPath]);
  const ctxMenu = useContextMenu();

  // Build a flat list of all folders for "Move to..." submenu
  const allFolders = useMemo(() => {
    const result: Array<{ root: VaultRoot; relativePath: string; label: string }> = [];
    const walk = (entries: MaterialEntry[], root: VaultRoot, depth: number) => {
      for (const e of entries) {
        if (e.isDirectory) {
          result.push({
            root,
            relativePath: e.relativePath,
            label: `${"  ".repeat(depth)}${e.name}`,
          });
          walk(e.children, root, depth + 1);
        }
      }
    };
    result.push({ root: "Lesson Plans", relativePath: "", label: "Lesson Plans (root)" });
    walk(lessonTree, "Lesson Plans", 1);
    result.push({ root: "Mindmaps", relativePath: "", label: "Mindmaps (root)" });
    walk(mindmapTree, "Mindmaps", 1);
    return result;
  }, [lessonTree, mindmapTree]);

  // Open rename modal for a single-root file
  const openRename = useCallback((root: VaultRoot, relativePath: string, isDirectory: boolean) => {
    const segs = relativePath.split("/").filter(Boolean);
    const name = segs[segs.length - 1] || "";
    const stem = !isDirectory && name.toLowerCase().endsWith(".json")
      ? name.replace(/\.json$/i, "")
      : name;
    setRenameInput(stem);
    setRenameModal({ roots: [root], relativePath, currentName: name, isDirectory });
  }, []);

  // Open rename for a unified folder (rename across all source roots)
  const openRenameUnified = useCallback((node: UnifiedNode) => {
    const segs = node.relativePath.split("/").filter(Boolean);
    const name = segs[segs.length - 1] || "";
    setRenameInput(name);
    setRenameModal({ roots: node.roots, relativePath: node.relativePath, currentName: name, isDirectory: true });
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameModal) return;
    const newName = renameInput.trim();
    for (const r of renameModal.roots) {
      await renameVaultPath(r, renameModal.relativePath, newName);
    }
    setRenameModal(null);
    setRenameInput("");
  }, [renameModal, renameInput, renameVaultPath]);

  // Build context menu entries for a file
  const buildFileMenu = useCallback(
    (root: VaultRoot, relativePath: string): ContextMenuEntry[] => {
      const isLesson = root === "Lesson Plans";
      return [
        {
          label: "Open",
          icon: <FolderOpen className="w-4 h-4" />,
          onClick: () => {
            if (isLesson) openLesson(relativePath);
            else openMindmap(relativePath);
          },
        },
        {
          label: "Preview",
          icon: <Eye className="w-4 h-4" />,
          onClick: () => {
            setVaultPreview({ type: isLesson ? "lesson" : "mindmap", relativePath });
          },
        },
        {
          label: "Rename",
          icon: <Pencil className="w-4 h-4" />,
          onClick: () => openRename(root, relativePath, false),
        },
        {
          label: "Duplicate",
          icon: <Copy className="w-4 h-4" />,
          onClick: () => duplicateVaultPath(root, relativePath),
        },
        {
          label: "Move to Folder",
          icon: <Move className="w-4 h-4" />,
          submenu: allFolders
            .filter((f) => f.root === root)
            .map((f) => ({
              label: f.label,
              onClick: () => moveVaultPath(root, relativePath, f.relativePath),
            })),
        },
        { type: "divider" },
        {
          label: "Move to Trash",
          icon: <Trash2 className="w-4 h-4" />,
          danger: true,
          onClick: () => deleteVaultPath(root, relativePath, false),
        },
      ];
    },
    [openLesson, openMindmap, openRename, duplicateVaultPath, moveVaultPath, deleteVaultPath, allFolders],
  );

  // Build context menu entries for a unified folder (applies ops across all
  // source roots that contain this folder).
  const buildFolderMenu = useCallback(
    (node: UnifiedNode): ContextMenuEntry[] => {
      const path = node.relativePath;
      const roots = node.roots;
      return [
        {
          label: "New Lesson Here",
          icon: <FileText className="w-4 h-4" />,
          onClick: () => createNewLesson(undefined, path),
        },
        {
          label: "New Mindmap Here",
          icon: <Network className="w-4 h-4" />,
          onClick: () => createNewMindmap(path),
        },
        {
          label: "New Subfolder",
          icon: <FolderPlus className="w-4 h-4" />,
          onClick: () => {
            setSelectedFolder(path);
            setNewFolderName("");
            setNewFolderModalOpen(true);
          },
        },
        { type: "divider" },
        {
          label: "Rename Folder",
          icon: <Pencil className="w-4 h-4" />,
          onClick: () => openRenameUnified(node),
        },
        {
          label: "Move to Folder",
          icon: <Move className="w-4 h-4" />,
          submenu: allFolders
            .filter((f) => f.relativePath !== path && !f.relativePath.startsWith(path + "/"))
            .map((f) => ({
              label: f.label,
              onClick: () => {
                roots.forEach((r) => moveVaultPath(r, path, f.relativePath));
              },
            })),
        },
        { type: "divider" },
        {
          label: "Delete Folder",
          icon: <Trash2 className="w-4 h-4" />,
          danger: true,
          onClick: () => {
            roots.forEach((r) => deleteVaultPath(r, path, true));
          },
        },
      ];
    },
    [createNewLesson, createNewMindmap, moveVaultPath, deleteVaultPath, allFolders],
  );

  // ===== Unified folder tree (merge lesson + mindmap) =====
  // The user expects ONE folder structure where lessons and mindmaps coexist.
  // We merge `lessonTree` and `mindmapTree` so folders with the same relative
  // path are combined; child files are tagged by their source root.
  type UnifiedNode = {
    name: string;
    relativePath: string;
    isDirectory: boolean;
    fileType?: "lesson" | "mindmap";
    children: UnifiedNode[];
    // Which roots contain this folder (for delete/rename across roots)
    roots: VaultRoot[];
  };

  const buildUnifiedTree = useCallback((): UnifiedNode[] => {
    const folderMap = new Map<string, UnifiedNode>();
    const rootFiles: UnifiedNode[] = [];

    const walk = (
      entries: MaterialEntry[],
      parent: UnifiedNode[],
      parentFolderMap: Map<string, UnifiedNode>,
      sourceRoot: VaultRoot,
      fileType: "lesson" | "mindmap",
    ) => {
      for (const e of entries) {
        if (e.isDirectory) {
          const existing = parentFolderMap.get(e.relativePath);
          if (existing) {
            // Merge: ensure root list includes sourceRoot, recurse children
            if (!existing.roots.includes(sourceRoot)) existing.roots.push(sourceRoot);
            // Build a child folder map for the existing node so nested merges work
            const childMap = new Map<string, UnifiedNode>();
            for (const c of existing.children) {
              if (c.isDirectory) childMap.set(c.relativePath, c);
            }
            walk(e.children, existing.children, childMap, sourceRoot, fileType);
          } else {
            const node: UnifiedNode = {
              name: e.name,
              relativePath: e.relativePath,
              isDirectory: true,
              children: [],
              roots: [sourceRoot],
            };
            parent.push(node);
            parentFolderMap.set(e.relativePath, node);
            const childMap = new Map<string, UnifiedNode>();
            walk(e.children, node.children, childMap, sourceRoot, fileType);
          }
        } else if (e.name.toLowerCase().endsWith(".json")) {
          parent.push({
            name: e.name,
            relativePath: e.relativePath,
            isDirectory: false,
            fileType,
            children: [],
            roots: [sourceRoot],
          });
        }
      }
    };

    walk(lessonTree, rootFiles, folderMap, "Lesson Plans", "lesson");
    walk(mindmapTree, rootFiles, folderMap, "Mindmaps", "mindmap");

    // Sort: folders first, then files; alphabetical within each group
    const sortNode = (nodes: UnifiedNode[]) => {
      nodes.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const n of nodes) if (n.isDirectory) sortNode(n.children);
    };
    sortNode(rootFiles);

    return rootFiles;
  }, [lessonTree, mindmapTree]);

  const unifiedTree = useMemo(buildUnifiedTree, [buildUnifiedTree]);

  // Walk tree collecting files with their folder paths
  const walkTree = useCallback(
    (entries: MaterialEntry[], type: "lesson" | "mindmap", acc: Array<{ name: string; relativePath: string; folderPath: string; type: "lesson" | "mindmap" }>) => {
      for (const e of entries) {
        if (e.isDirectory) {
          walkTree(e.children, type, acc);
        } else if (e.name.toLowerCase().endsWith(".json")) {
          const folderPath = e.relativePath.includes("/")
            ? e.relativePath.substring(0, e.relativePath.lastIndexOf("/"))
            : "";
          acc.push({ name: e.name, relativePath: e.relativePath, folderPath, type });
        }
      }
    },
    [],
  );

  // Search results - filter by query, include folder paths
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const all: Array<{ name: string; relativePath: string; folderPath: string; type: "lesson" | "mindmap" }> = [];
    walkTree(lessonTree, "lesson", all);
    walkTree(mindmapTree, "mindmap", all);
    return all.filter((r) => r.name.toLowerCase().includes(q) || r.folderPath.toLowerCase().includes(q));
  }, [searchQuery, lessonTree, mindmapTree, walkTree]);

  // selectedFolder is now just the unified folder path (e.g. "History+/Math").
  // Empty string means root.
  const selectedSub = selectedFolder ?? undefined;

  // Open inline folder creation modal
  const handleCreateFolder = useCallback(() => {
    setNewFolderName("");
    setNewFolderModalOpen(true);
  }, []);

  const submitNewFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    // Create the folder in BOTH roots so it's a true unified folder.
    const subPath = selectedSub ? `/${selectedSub}` : "";
    await createVaultFolder(name, `Lesson Plans${subPath}`);
    await createVaultFolder(name, `Mindmaps${subPath}`);
    setNewFolderModalOpen(false);
    setNewFolderName("");
  }, [createVaultFolder, selectedSub, newFolderName]);

  // Create lesson/mindmap inside the currently selected folder.
  const handleCreateLesson = useCallback(() => {
    createNewLesson(undefined, selectedSub);
  }, [createNewLesson, selectedSub]);

  const handleCreateMindmap = useCallback(() => {
    createNewMindmap(selectedSub);
  }, [createNewMindmap, selectedSub]);

  // Handle panel switching
  const handlePanelSwitch = useCallback((panel: PanelType) => {
    if (activePanel === panel && pushPanelOpen) {
      setPushPanelOpen(false);
    } else {
      setActivePanel(panel);
      setPushPanelOpen(true);
    }
  }, [activePanel, pushPanelOpen]);

  // Toggle folder expansion
  const toggleFolder = (folderPath: string) => {
    setExpandedMaterialFolders({
      ...expandedMaterialFolders,
      [folderPath]: !expandedMaterialFolders[folderPath],
    });
  };

  // Recursive render of a UnifiedNode tree branch
  const renderUnifiedNode = (node: UnifiedNode, depth: number): any => {
    const key = `unified:${node.isDirectory ? "d" : "f"}:${node.relativePath}:${node.fileType ?? ""}`;

    if (node.isDirectory) {
      const isExpanded = !!expandedMaterialFolders[key];
      const isSelected = selectedFolder === node.relativePath;
      const isDropTarget = dragOverFolder === key;
      return (
        <li key={key}>
          <div
            data-folder-path={node.relativePath}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors text-left cursor-pointer select-none ${
              isSelected
                ? "bg-[var(--tp-accent)]/15 text-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
            } ${isDropTarget ? "tp-drop-target" : ""}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOverFolder(key);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverFolder !== key) setDragOverFolder(key);
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget as Node | null;
              if (!related || !e.currentTarget.contains(related)) {
                setDragOverFolder(null);
              }
            }}
            onDrop={(e) => {
              handleDropOnUnifiedFolder(e, node.relativePath);
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(key);
              }}
              className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-black/20 transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
            </button>
            <div
              className="flex-1 flex items-center gap-1.5 cursor-pointer"
              onClick={(e) => {
                if ((e as any).dropped) return;
                setSelectedFolder(isSelected ? null : node.relativePath);
              }}
              onContextMenu={(e) => ctxMenu.open(e, buildFolderMenu(node))}
            >
              <FolderIcon expanded={isExpanded} />
              <span className="truncate font-medium">{node.name}</span>
              <span className="ml-auto text-xs text-gray-500">{node.children.length}</span>
            </div>
          </div>
          {isExpanded && node.children.length > 0 && (
            <ul className="space-y-0.5">
              {node.children.map((child) => renderUnifiedNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    }

    // File — split into drag handle + click area so the two gestures don't conflict
    const root: VaultRoot = node.fileType === "mindmap" ? "Mindmaps" : "Lesson Plans";
    const isActive = activeFilePath?.endsWith(node.relativePath) ?? false;
    return (
      <li key={key}>
        <div
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors select-none ${
            isActive
              ? "bg-[var(--tp-accent)]/10 text-white"
              : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
          }`}
          style={{ paddingLeft: `${8 + depth * 12}px`, WebkitUserSelect: "none" }}
        >
          {/* Drag handle — onMouseDown starts mouse-based drag (reliable in WKWebView) */}
          <div
            onMouseDown={(e) => startSidebarMouseDrag(e, root, node.relativePath, node.name.replace(/\.json$/i, ""))}
            className="shrink-0 flex items-center justify-center w-4 h-4 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition-colors select-none"
            title="Drag to move to folder"
          >
            <GripVertical className="w-3 h-3" />
          </div>
          {/* Clickable area */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (node.fileType === "lesson") openLesson(node.relativePath);
              else openMindmap(node.relativePath);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (node.fileType === "lesson") openLesson(node.relativePath);
                else openMindmap(node.relativePath);
              }
            }}
            onContextMenu={(e) => ctxMenu.open(e, buildFileMenu(root, node.relativePath))}
            className="flex-1 flex items-center gap-1.5 min-w-0 cursor-pointer"
          >
            {node.fileType === "lesson" ? <LessonIcon /> : <MindmapIcon />}
            <span className="truncate">{node.name.replace(/\.json$/i, "")}</span>
          </div>
        </div>
      </li>
    );
  };

  // Drop handler for the unified tree: file moves to the same path under its
  // own root (cross-root moves not supported because schemas differ).
  const handleDropOnUnifiedFolder = useCallback(
    (e: React.DragEvent, folderRelative: string) => {
      e.preventDefault();
      setDragOverFolder(null);
      try {
        // Try custom MIME type first, fall back to text/plain (WKWebView strips custom types),
        // then fall back to the ref set on dragStart.
        let raw = e.dataTransfer.getData("application/teacherpro-vault-item");
        if (!raw) raw = e.dataTransfer.getData("text/plain");
        if (!raw) {
          const refPayload = vaultDragPayloadRef.current;
          vaultDragPayloadRef.current = null;
          if (refPayload) {
            moveVaultPath(refPayload.root, refPayload.relativePath, folderRelative);
          }
          return;
        }
        const payload = JSON.parse(raw) as { root: VaultRoot; relativePath: string };
        vaultDragPayloadRef.current = null;
        moveVaultPath(payload.root, payload.relativePath, folderRelative);
      } catch (err) {
        console.warn("Failed to parse drop payload", err);
      }
    },
    [moveVaultPath, vaultDragPayloadRef],
  );

  // ===== Materials =====
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  // Vault item preview (lessons/mindmaps)
  const [vaultPreview, setVaultPreview] = useState<{ type: "lesson" | "mindmap"; relativePath: string } | null>(null);

  const resolveMaterialAbsPath = useCallback(
    async (relativePath: string): Promise<string | null> => {
      if (!vaultPath) return null;
      const segs = relativePath.split("/").filter(Boolean);
      return await join(vaultPath, "Materials", ...segs);
    },
    [vaultPath],
  );

  const openMaterialInDefaultApp = useCallback(
    async (relativePath: string) => {
      const fullPath = await resolveMaterialAbsPath(relativePath);
      if (!fullPath) return;
      try {
        const present = await exists(fullPath);
        if (!present) {
          alert(`Material not found: ${relativePath}`);
          return;
        }
        await invoke("open_file_in_default_app", { path: fullPath });
      } catch (err) {
        console.error("Failed to open material", err);
        alert("Could not open this material in the default app.");
      }
    },
    [resolveMaterialAbsPath],
  );

  const revealMaterial = useCallback(
    async (relativePath: string) => {
      const fullPath = await resolveMaterialAbsPath(relativePath);
      if (!fullPath) return;
      try {
        const present = await exists(fullPath);
        if (!present) {
          alert(`Material not found: ${relativePath}`);
          return;
        }
        await revealItemInDir(fullPath);
      } catch (err) {
        console.error("Failed to reveal material", err);
        alert("Could not reveal this item in your file manager.");
      }
    },
    [resolveMaterialAbsPath],
  );

  const handleImportMaterialFiles = useCallback(async () => {
    setMaterialsImportBusy(true);
    try {
      await addMaterialFiles();
    } finally {
      setMaterialsImportBusy(false);
    }
  }, [addMaterialFiles]);

  const handleImportMaterialFolder = useCallback(async () => {
    setMaterialsImportBusy(true);
    try {
      await addMaterialDirectory();
    } finally {
      setMaterialsImportBusy(false);
    }
  }, [addMaterialDirectory]);

  // Insert material at current cursor position (must be inside a lesson table body row)
  const insertMaterialAtCursor = useCallback(
    (relativePath: string, isDirectory: boolean) => {
      if (currentView !== "editor" || !activeFilePath) return;
      setPendingMaterialDrop({
        relativePath,
        isDirectory,
        clientX: -1,
        clientY: -1,
      });
      setDraggedMaterial(null);
    },
    [currentView, activeFilePath, setPendingMaterialDrop, setDraggedMaterial],
  );

  const buildMaterialMenu = useCallback(
    (entry: MaterialEntry): ContextMenuEntry[] => {
      const isFile = !entry.isDirectory;
      const items: ContextMenuEntry[] = [];

      if (isFile) {
        items.push({
          label: "Preview",
          icon: <Eye className="w-4 h-4" />,
          onClick: () => setPreviewPath(entry.relativePath),
        });
        items.push({
          label: "Open in Default App",
          icon: <ExternalLink className="w-4 h-4" />,
          onClick: () => openMaterialInDefaultApp(entry.relativePath),
        });
      }
      items.push({
        label: "Reveal in Finder",
        icon: <FolderRevealIcon className="w-4 h-4" />,
        onClick: () => revealMaterial(entry.relativePath),
      });

      if (currentView === "editor" && activeFilePath) {
        items.push({ type: "divider" });
        items.push({
          label: "Insert at Cursor",
          icon: <FileText className="w-4 h-4" />,
          onClick: () => insertMaterialAtCursor(entry.relativePath, entry.isDirectory),
        });
      }

      items.push({ type: "divider" });
      items.push({
        label: "Rename",
        icon: <Pencil className="w-4 h-4" />,
        onClick: () => {
          const segs = entry.relativePath.split("/").filter(Boolean);
          const name = segs[segs.length - 1] || "";
          const newName = window.prompt("New name:", name);
          if (newName && newName.trim() && newName !== name) {
            renameMaterialEntry(entry.relativePath, newName.trim());
          }
        },
      });
      items.push({ type: "divider" });
      items.push({
        label: "Move to Trash",
        icon: <Trash2 className="w-4 h-4" />,
        danger: true,
        onClick: () => deleteMaterialEntry(entry.relativePath, entry.isDirectory),
      });

      return items;
    },
    [
      currentView,
      activeFilePath,
      insertMaterialAtCursor,
      renameMaterialEntry,
      deleteMaterialEntry,
      openMaterialInDefaultApp,
      revealMaterial,
    ],
  );

  const renderMaterialNode = (entry: MaterialEntry, depth: number): any => {
    const key = `mat:${entry.relativePath}`;
    if (entry.isDirectory) {
      const isExpanded = !!expandedMaterials[key];
      return (
        <li key={key}>
          <div
            role="button"
            tabIndex={0}
            draggable={true}
            onClick={() =>
              setExpandedMaterials((prev) => ({ ...prev, [key]: !prev[key] }))
            }
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(
                "application/teacherpro-material",
                JSON.stringify({ relativePath: entry.relativePath, itemType: "folder" }),
              );
              e.dataTransfer.setData("application/teacherpro-file", entry.relativePath);
              e.dataTransfer.setData("text/plain", entry.relativePath);
              setDraggedMaterial({ relativePath: entry.relativePath, isDirectory: true });
            }}
            onDragEnd={() => setDraggedMaterial(null)}
            onDoubleClick={() => insertMaterialAtCursor(entry.relativePath, true)}
            onContextMenu={(e) => ctxMenu.open(e, buildMaterialMenu(entry))}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors select-none text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
            style={{ paddingLeft: `${8 + depth * 12}px`, WebkitUserSelect: "none" }}
          >
            <ChevronRight
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
            <FolderIcon expanded={isExpanded} />
            <span className="truncate font-medium">{entry.name}</span>
            <span className="ml-auto text-xs text-gray-500">{entry.children.length}</span>
          </div>
          {isExpanded && entry.children.length > 0 && (
            <ul className="space-y-0.5">
              {entry.children.map((child) => renderMaterialNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    }
    return (
      <li key={key}>
        <div
          role="button"
          tabIndex={0}
          draggable={true}
          onClick={() => {
            // Single click expands cell preview behavior — left as no-op for simplicity
          }}
          onDoubleClick={() => insertMaterialAtCursor(entry.relativePath, false)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "copy";
            e.dataTransfer.setData(
              "application/teacherpro-material",
              JSON.stringify({ relativePath: entry.relativePath, itemType: "file" }),
            );
            e.dataTransfer.setData("application/teacherpro-file", entry.relativePath);
            e.dataTransfer.setData("text/plain", entry.relativePath);
            setDraggedMaterial({ relativePath: entry.relativePath, isDirectory: false });
          }}
          onDragEnd={() => setDraggedMaterial(null)}
          onContextMenu={(e) => ctxMenu.open(e, buildMaterialMenu(entry))}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] cursor-pointer transition-colors truncate select-none"
          style={{ paddingLeft: `${8 + depth * 12 + 14}px`, WebkitUserSelect: "none" }}
          title={`${entry.name} — double-click to insert at cursor`}
        >
          <FileText className="w-4 h-4 shrink-0 text-amber-400/80" />
          <span className="truncate">{entry.name}</span>
        </div>
      </li>
    );
  };

  // Recursive render of trash entries with inline restore/delete buttons
  // Note: entry.relativePath already includes the top-level section name
  // (e.g. "Lesson Plans/file.json"), so we DO NOT prefix it again.
  const renderTrashNode = (entry: MaterialEntry, depth: number, sectionPrefix: string): any => {
    const key = `trash:${entry.relativePath}`;
    const fullPath = entry.relativePath;
    if (entry.isDirectory) {
      const isExpanded = !!expandedTrashSections[key];
      return (
        <li key={key}>
          <div
            className="group w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-3)] cursor-pointer transition-colors"
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onClick={() =>
              setExpandedTrashSections((prev) => ({ ...prev, [key]: !prev[key] }))
            }
            onContextMenu={(e) =>
              ctxMenu.open(e, [
                {
                  label: "Restore",
                  icon: <RotateCcw className="w-4 h-4" />,
                  onClick: () => restoreTrashEntry(fullPath, true),
                },
                { type: "divider" },
                {
                  label: "Delete Permanently",
                  icon: <Trash2 className="w-4 h-4" />,
                  danger: true,
                  onClick: () => permanentlyDeleteTrashEntry(fullPath, true),
                },
              ])
            }
          >
            <ChevronRight
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
            <FolderIcon expanded={isExpanded} />
            <span className="truncate font-medium flex-1">{entry.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                restoreTrashEntry(fullPath, true);
              }}
              title="Restore"
              className="opacity-0 group-hover:opacity-100 h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-emerald-400 hover:bg-emerald-400/10 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                permanentlyDeleteTrashEntry(fullPath, true);
              }}
              title="Delete permanently"
              className="opacity-0 group-hover:opacity-100 h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-red-400 hover:bg-red-400/10 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-[var(--tp-t-4)] ml-1">{entry.children.length}</span>
          </div>
          {isExpanded && entry.children.length > 0 && (
            <ul className="space-y-0.5">
              {entry.children.map((child) => renderTrashNode(child, depth + 1, sectionPrefix))}
            </ul>
          )}
        </li>
      );
    }
    return (
      <li key={key}>
        <div
          className="group w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-3)] truncate transition-colors"
          style={{ paddingLeft: `${8 + depth * 12 + 14}px` }}
          onContextMenu={(e) => {
            const isTrashLesson = sectionPrefix === "Lesson Plans";
            const isTrashJson = entry.name.toLowerCase().endsWith(".json");
            ctxMenu.open(e, [
              {
                label: "Restore",
                icon: <RotateCcw className="w-4 h-4" />,
                onClick: () => restoreTrashEntry(fullPath, false),
              },
              ...(isTrashJson ? [
                {
                  label: "Preview",
                  icon: <Eye className="w-4 h-4" />,
                  onClick: () => {
                    // Strip "Lesson Plans/" or "Mindmaps/" prefix from fullPath
                    const cleanPath = fullPath.replace(/^(Lesson Plans|Mindmaps)\//, "");
                    setVaultPreview({ type: isTrashLesson ? "lesson" : "mindmap", relativePath: cleanPath });
                  },
                } as ContextMenuEntry,
              ] : []),
              { type: "divider" },
              {
                label: "Delete Permanently",
                icon: <Trash2 className="w-4 h-4" />,
                danger: true,
                onClick: () => permanentlyDeleteTrashEntry(fullPath, false),
              },
            ]);
          }}
        >
          {entry.name.toLowerCase().endsWith(".json") ? (
            sectionPrefix === "Mindmaps" ? <MindmapIcon /> : <LessonIcon />
          ) : (
            <FileText className="w-4 h-4 shrink-0 text-[var(--tp-t-3)]" />
          )}
          <span className="truncate flex-1">{entry.name.replace(/\.json$/i, "")}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              restoreTrashEntry(fullPath, false);
            }}
            title="Restore"
            className="opacity-0 group-hover:opacity-100 h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-emerald-400 hover:bg-emerald-400/10 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              permanentlyDeleteTrashEntry(fullPath, false);
            }}
            title="Delete permanently"
            className="opacity-0 group-hover:opacity-100 h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-red-400 hover:bg-red-400/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </li>
    );
  };

  const trashTotalCount = useMemo(() => {
    const count = (entries: MaterialEntry[]): number =>
      entries.reduce((sum, e) => sum + (e.isDirectory ? count(e.children) : 1), 0);
    return count(trashEntries);
  }, [trashEntries]);

  // Render nested vault tree from lessonTree and mindmapTree
  const renderVaultTree = () => {
    const hasAny = lessonTree.length > 0 || mindmapTree.length > 0;
    if (!hasAny) {
      return (
        <div className="px-2 py-4 text-sm text-gray-500 text-center">
          No files yet. Create a lesson or mindmap to get started.
        </div>
      );
    }
    return <>{unifiedTree.map((node) => renderUnifiedNode(node, 0))}</>;
  };

  return (
    <>
      {/* MINIMAL ICON SIDEBAR - Always 56px */}
      <div
        className="print:hidden flex flex-col items-center py-4 gap-2 shrink-0 z-20"
        style={{
          width: "56px",
          background: "var(--tp-bg-1)",
          borderRight: "1px solid var(--tp-b-1)",
        }}
      >
        {/* Brand icon */}
        <img
          src="/icon.png"
          alt="TeacherPro"
          className="w-8 h-8 rounded-md mb-2"
        />

        <div className="w-6 h-px bg-[var(--tp-b-1)] my-1" />

        {/* Explorer */}
        <button
          onClick={() => handlePanelSwitch("explorer")}
          title="Explorer"
          className={`w-11 h-11 inline-flex items-center justify-center rounded-[10px] transition-all ${
            activePanel === "explorer" && pushPanelOpen
              ? "bg-[var(--tp-accent)]/10 text-[var(--tp-accent)]"
              : "text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)]"
          }`}
        >
          <FolderOpen className="w-5 h-5" />
        </button>

        {/* Search */}
        <button
          onClick={() => handlePanelSwitch("search")}
          title="Search"
          className={`w-11 h-11 inline-flex items-center justify-center rounded-[10px] transition-all ${
            activePanel === "search" && pushPanelOpen
              ? "bg-[var(--tp-accent)]/10 text-[var(--tp-accent)]"
              : "text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)]"
          }`}
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Recent */}
        <button
          onClick={() => handlePanelSwitch("recent")}
          title="Recent"
          className={`w-11 h-11 inline-flex items-center justify-center rounded-[10px] transition-all ${
            activePanel === "recent" && pushPanelOpen
              ? "bg-[var(--tp-accent)]/10 text-[var(--tp-accent)]"
              : "text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)]"
          }`}
        >
          <Clock className="w-5 h-5" />
        </button>

        {/* Calendar */}
        <button
          onClick={() => handlePanelSwitch("calendar")}
          title="Calendar"
          className={`w-11 h-11 inline-flex items-center justify-center rounded-[10px] transition-all ${
            activePanel === "calendar" && pushPanelOpen
              ? "bg-[var(--tp-accent)]/10 text-[var(--tp-accent)]"
              : "text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)]"
          }`}
        >
          <Calendar className="w-5 h-5" />
        </button>

        <div className="flex-1" />

        {/* Trash */}
        <button
          onClick={() => handlePanelSwitch("trash")}
          title={`Trash${trashTotalCount ? ` (${trashTotalCount})` : ""}`}
          className={`relative w-11 h-11 inline-flex items-center justify-center rounded-[10px] transition-all ${
            activePanel === "trash" && pushPanelOpen
              ? "bg-[var(--tp-accent)]/10 text-[var(--tp-accent)]"
              : "text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)]"
          }`}
        >
          <Trash className="w-5 h-5" />
          {trashTotalCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
              style={{ background: "var(--tp-accent)", color: "#fff" }}
            >
              {trashTotalCount}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className={`w-11 h-11 inline-flex items-center justify-center rounded-[10px] transition-all ${
            settingsOpen
              ? "bg-[var(--tp-accent)]/10 text-[var(--tp-accent)]"
              : "text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)]"
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* PUSH PANEL - Slides in/out */}
      {vaultPath && (
        <div
          className="print:hidden flex flex-col relative tp-sidebar transition-[width] duration-300 ease-in-out overflow-hidden"
          style={{
            width: pushPanelOpen ? "280px" : "0",
            background: "var(--tp-bg-1)",
            borderRight: "1px solid var(--tp-b-1)",
          }}
        >
          {/* Panel Header */}
          <div
            className="flex items-center justify-between px-4 shrink-0"
            style={{
              height: "56px",
              borderBottom: "1px solid var(--tp-b-1)",
            }}
          >
            <span className="font-semibold text-[15px]" style={{ color: "var(--tp-t-1)" }}>
              {activePanel === "explorer" && "Explorer"}
              {activePanel === "search" && "Search"}
              {activePanel === "recent" && "Recent"}
              {activePanel === "calendar" && "Calendar"}
              {activePanel === "trash" && "Trash"}
            </span>
            <button
              onClick={() => setPushPanelOpen(false)}
              title="Close panel"
              className="h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors shrink-0 text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)]"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* EXPLORER PANEL */}
          {activePanel === "explorer" && (
            <>
              {/* Action buttons */}
              <div className="shrink-0 px-3 pt-3 pb-2">
                <div className="flex gap-1.5">
                  <button
                    onClick={handleCreateLesson}
                    title={selectedFolder ? `New Lesson in ${selectedFolder}` : "New Lesson"}
                    className="tp-action-btn flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Lesson
                  </button>
                  <button
                    onClick={handleCreateMindmap}
                    title={selectedFolder ? `New Mindmap in ${selectedFolder}` : "New Mindmap"}
                    className="tp-action-btn flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium"
                  >
                    <Network className="w-3.5 h-3.5" />
                    Mindmap
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    title={selectedFolder ? `New Folder in ${selectedFolder}` : "New Folder in Lesson Plans"}
                    className="tp-action-btn flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    Folder
                  </button>
                </div>
              </div>

              {/* Nested Folder Tree (top ~2/3) */}
              <div data-explorer-panel className="flex-[2] overflow-y-auto py-2 min-h-0">
                <ul className="space-y-0.5 px-2">
                  {renderVaultTree()}
                </ul>
              </div>

              {/* Materials section (bottom ~40%) */}
              <div
                className="shrink-0 flex flex-col min-h-0"
                style={{ borderTop: "1px solid var(--tp-b-1)", flex: "1.5 1 0", maxHeight: "45%" }}
              >
                <div className="shrink-0 px-3 pt-2 pb-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: "var(--tp-t-4)" }}>
                    Materials
                    {materials.length > 0 && (
                      <span className="ml-1.5 text-[var(--tp-t-3)] font-normal normal-case">
                        · {materials.length}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleImportMaterialFiles}
                      disabled={materialsImportBusy}
                      title="Import files into Materials"
                      className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)] transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleImportMaterialFolder}
                      disabled={materialsImportBusy}
                      title="Import folder into Materials"
                      className="h-6 w-6 inline-flex items-center justify-center rounded text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-3)] transition-colors disabled:opacity-50"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pb-2">
                  {materials.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--tp-t-4)" }}>
                      No materials yet. Click <Plus className="inline w-3 h-3 -mt-0.5" /> to import files or{" "}
                      <FolderPlus className="inline w-3 h-3 -mt-0.5" /> for a folder.
                    </div>
                  ) : (
                    <ul className="space-y-0.5 px-2">
                      {materials.map((m) => renderMaterialNode(m, 0))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}

          {/* SEARCH PANEL */}
          {activePanel === "search" && (
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-3 pb-2">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-md transition-colors focus-within:border-[var(--tp-accent)]"
                  style={{
                    background: "var(--tp-bg-2)",
                    border: "1px solid var(--tp-b-2)",
                  }}
                >
                  <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--tp-t-3)" }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search lessons, mindmaps..."
                    className="flex-1 min-w-0 bg-transparent outline-none border-none text-[12.5px]"
                    style={{ color: "var(--tp-t-1)" }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="h-5 w-5 inline-flex items-center justify-center rounded"
                      style={{ color: "var(--tp-t-3)" }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {searchQuery.trim() === "" ? (
                <div className="px-3 py-4 text-center text-sm text-[var(--tp-t-3)]">
                  Type to search lessons and mindmaps
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-[var(--tp-t-3)]">
                  No results for "{searchQuery}"
                </div>
              ) : (
                <ul className="space-y-0.5 px-2 mt-2">
                  {searchResults.map((item) => {
                    const displayName = item.name.replace(/\.json$/i, "");
                    const rootLabel = item.type === "lesson" ? "Lesson Plans" : "Mindmaps";
                    const fullFolderPath = item.folderPath
                      ? `${rootLabel} / ${item.folderPath.split("/").join(" / ")}`
                      : rootLabel;
                    return (
                      <li key={`${item.type}-${item.relativePath}`}>
                        <button
                          onClick={() => {
                            if (item.type === "lesson") openLesson(item.relativePath);
                            else openMindmap(item.relativePath);
                          }}
                          className="w-full flex items-start gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                        >
                          <div className="mt-0.5">
                            {item.type === "lesson" ? <LessonIcon /> : <MindmapIcon />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px]">{displayName}</div>
                            <div className="truncate text-[11px] text-gray-500">{fullFolderPath}</div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* RECENT PANEL */}
          {activePanel === "recent" && (
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-3 pb-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[var(--tp-t-4)]">Recently Opened</span>
                {recents.length > 0 && (
                  <button
                    onClick={clearRecents}
                    className="text-[11px] text-[var(--tp-t-3)] hover:text-[var(--tp-t-1)] transition-colors"
                    title="Clear all recents"
                  >
                    Clear
                  </button>
                )}
              </div>
              {recents.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-[var(--tp-t-3)]">
                  Open a lesson or mindmap to see it here.
                </div>
              ) : (
                <ul className="space-y-0.5 px-2">
                  {recents.map((r) => {
                    const segs = r.relativePath.split("/");
                    const name = (segs[segs.length - 1] || "").replace(/\.json$/i, "");
                    const folderPath = segs.slice(0, -1).join(" / ");
                    const root = r.type === "lesson" ? "Lesson Plans" : "Mindmaps";
                    const breadcrumb = folderPath ? `${root} / ${folderPath}` : root;
                    return (
                      <li key={`${r.type}-${r.relativePath}`}>
                        <button
                          onClick={() => {
                            if (r.type === "lesson") openLesson(r.relativePath);
                            else openMindmap(r.relativePath);
                          }}
                          onContextMenu={(e) =>
                            ctxMenu.open(
                              e,
                              buildFileMenu(
                                r.type === "lesson" ? "Lesson Plans" : "Mindmaps",
                                r.relativePath,
                              ),
                            )
                          }
                          className="w-full flex items-start gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                        >
                          <div className="mt-0.5">
                            {r.type === "lesson" ? <LessonIcon /> : <MindmapIcon />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px]">{name}</div>
                            <div className="truncate text-[11px] text-gray-500">{breadcrumb}</div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* CALENDAR PANEL */}
          {activePanel === "calendar" && (
            <div className="flex-1 overflow-y-auto py-2 px-3">
              <MiniCalendar />
            </div>
          )}

          {/* TRASH PANEL */}
          {activePanel === "trash" && (
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-3 pb-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[var(--tp-t-4)]">
                  Trash · {trashTotalCount} item{trashTotalCount === 1 ? "" : "s"}
                </span>
                {trashEntries.length > 0 && (
                  <button
                    onClick={() => {
                      if (!confirm("Permanently delete ALL trashed items? This cannot be undone.")) return;
                      // Each section's children already carry section name in relativePath
                      trashEntries.forEach((sec) => {
                        sec.children.forEach((child) => {
                          permanentlyDeleteTrashEntry(child.relativePath, child.isDirectory);
                        });
                      });
                    }}
                    className="text-[11px] text-[var(--tp-t-3)] hover:text-red-400 transition-colors"
                  >
                    Empty Trash
                  </button>
                )}
              </div>
              {trashEntries.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-[var(--tp-t-3)]">
                  Trash is empty.
                </div>
              ) : (
                <ul className="space-y-0.5 px-2">
                  {trashEntries.map((section) => {
                    const sectionKey = `trash-section:${section.name}`;
                    const open = expandedTrashSections[sectionKey] ?? true;
                    return (
                      <li key={sectionKey} className="mb-2">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setExpandedTrashSections((prev) => ({ ...prev, [sectionKey]: !open }))
                          }
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md text-[var(--tp-t-4)] hover:text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-3)] cursor-pointer transition-colors uppercase tracking-wider"
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                          />
                          <span className="font-semibold">{section.name}</span>
                          <span className="ml-auto text-[10px]">{section.children.length}</span>
                        </div>
                        {open && (
                          <ul className="space-y-0.5">
                            {section.children.map((child) => renderTrashNode(child, 1, section.name))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* No Vault State */}
      {!vaultPath && pushPanelOpen && (
        <div
          className="print:hidden flex flex-col relative tp-sidebar transition-[width] duration-300 ease-in-out overflow-hidden"
          style={{
            width: "280px",
            background: "var(--tp-bg-1)",
            borderRight: "1px solid var(--tp-b-1)",
          }}
        >
          <div className="px-4 pt-5">
            <button
              onClick={useAppStore.getState().openVault}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-md text-sm font-medium text-white transition-colors"
              style={{ background: "var(--tp-accent)" }}
            >
              <FolderOpen className="w-4 h-4" />
              Open Vault
            </button>
            <p className="mt-3 text-[11.5px] leading-[1.5] text-center" style={{ color: "var(--tp-t-3)" }}>
              Pick a folder on your computer to use as a TeacherPro vault.
            </p>
          </div>
        </div>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <MaterialPreviewModal
        open={!!previewPath}
        relativePath={previewPath}
        onClose={() => setPreviewPath(null)}
      />

      <VaultItemPreviewModal
        open={!!vaultPreview}
        itemType={vaultPreview?.type || "lesson"}
        relativePath={vaultPreview?.relativePath || null}
        onClose={() => setVaultPreview(null)}
      />

      {/* Context Menu */}
      {ctxMenu.menu && (
        <ContextMenu
          x={ctxMenu.menu.x}
          y={ctxMenu.menu.y}
          items={ctxMenu.menu.items}
          onClose={ctxMenu.close}
        />
      )}

      {/* Rename Modal */}
      {renameModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={() => setRenameModal(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div
            className="relative w-[min(420px,calc(100vw-1.5rem))] rounded-xl shadow-2xl overflow-hidden"
            style={{ background: "var(--tp-bg-1)", border: "1px solid var(--tp-b-2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--tp-b-1)" }}>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--tp-t-1)" }}>
                Rename {renameModal.isDirectory ? "folder" : "file"}
              </h3>
              <p className="text-[12px] mt-1" style={{ color: "var(--tp-t-3)" }}>
                Current: {renameModal.currentName}
              </p>
            </div>
            <div className="px-5 py-4">
              <input
                autoFocus
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  else if (e.key === "Escape") setRenameModal(null);
                }}
                placeholder="New name"
                className="w-full px-3 py-2 rounded-md text-sm outline-none"
                style={{
                  background: "var(--tp-bg-2)",
                  border: "1px solid var(--tp-b-1)",
                  color: "var(--tp-t-1)",
                }}
              />
            </div>
            <div
              className="px-5 py-3 flex items-center justify-end gap-2"
              style={{ borderTop: "1px solid var(--tp-b-1)" }}
            >
              <button
                onClick={() => setRenameModal(null)}
                className="px-3 py-1.5 rounded-md text-[13px] transition-colors"
                style={{ color: "var(--tp-t-3)" }}
              >
                Cancel
              </button>
              <button
                onClick={submitRename}
                disabled={!renameInput.trim()}
                className="px-3 py-1.5 rounded-md text-[13px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--tp-accent)" }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal (Tauri webview blocks window.prompt) */}
      {newFolderModalOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={() => setNewFolderModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
          <div
            className="relative w-[min(420px,calc(100vw-1.5rem))] rounded-xl shadow-2xl overflow-hidden"
            style={{ background: "var(--tp-bg-1)", border: "1px solid var(--tp-b-2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--tp-b-1)" }}>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--tp-t-1)" }}>
                Create new folder
              </h3>
              <p className="text-[12px] mt-1" style={{ color: "var(--tp-t-3)" }}>
                {selectedSub ? `Inside ${selectedSub}` : "At vault root"}
              </p>
            </div>
            <div className="px-5 py-4">
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNewFolder();
                  else if (e.key === "Escape") setNewFolderModalOpen(false);
                }}
                placeholder="Folder name"
                className="w-full px-3 py-2 rounded-md text-sm outline-none"
                style={{
                  background: "var(--tp-bg-2)",
                  border: "1px solid var(--tp-b-1)",
                  color: "var(--tp-t-1)",
                }}
              />
            </div>
            <div
              className="px-5 py-3 flex items-center justify-end gap-2"
              style={{ borderTop: "1px solid var(--tp-b-1)" }}
            >
              <button
                onClick={() => setNewFolderModalOpen(false)}
                className="px-3 py-1.5 rounded-md text-[13px] transition-colors"
                style={{ color: "var(--tp-t-3)" }}
              >
                Cancel
              </button>
              <button
                onClick={submitNewFolder}
                disabled={!newFolderName.trim()}
                className="px-3 py-1.5 rounded-md text-[13px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--tp-accent)" }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

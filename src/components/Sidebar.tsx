import { ReactNode, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  Search,
  Copy,
  RotateCcw,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { AccentColor, MaterialEntry, MindmapData, PaperTone, ThemeMode, useAppStore } from "../store";
import { MiniCalendar } from "./MiniCalendar";

type SidebarMenuTarget =
  | { kind: "lesson"; fileName: string }
  | { kind: "mindmap"; fileName: string }
  | { kind: "material"; relativePath: string; isDirectory: boolean }
  | { kind: "trash"; relativePath: string; isDirectory: boolean };

interface SidebarMenuState {
  x: number;
  y: number;
  target: SidebarMenuTarget;
}

type MaterialPreviewKind = "pdf" | "image" | "text" | "error" | "lesson" | "mindmap";

interface LessonPreviewData {
  html: string;
  teacher: string;
  subject: string;
  plannedFor: string;
  createdAt: string;
}

interface MindmapPreviewNode {
  id: string;
  label: string;
  x: number;
  y: number;
  style: CSSProperties;
}

interface MindmapPreviewEdge {
  id: string;
  source: string;
  target: string;
}

interface MindmapPreviewData {
  nodes: MindmapPreviewNode[];
  edges: MindmapPreviewEdge[];
}

interface MaterialPreviewState {
  title: string;
  kind: MaterialPreviewKind;
  src?: string;
  text?: string;
  message?: string;
  blobUrl?: string;
  lesson?: LessonPreviewData;
  mindmap?: MindmapPreviewData;
}

const ACCENT_PRESET_COLORS: Record<string, string> = {
  blue: "#9fd2e4",
  emerald: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
};

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: "blue", label: "Blue", color: "#9fd2e4" },
  { value: "emerald", label: "Emerald", color: "#059669" },
  { value: "rose", label: "Rose", color: "#e11d48" },
  { value: "amber", label: "Amber", color: "#d97706" },
];

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
];

const PAPER_TONE_OPTIONS: Array<{ value: PaperTone; label: string }> = [
  { value: "light", label: "White" },
  { value: "dark", label: "Dark" },
];

type SettingsSection = "appearance" | "defaults" | "advanced";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
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

function resolveAccentColorValue(accentValue: string): string {
  if (ACCENT_PRESET_COLORS[accentValue]) {
    return ACCENT_PRESET_COLORS[accentValue];
  }

  if (isHexColor(accentValue)) {
    return normalizeHexColor(accentValue);
  }

  return ACCENT_PRESET_COLORS.blue;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPreviewDate(isoValue: string | null | undefined): string {
  if (!isoValue) return "-";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

function isSafeCssColor(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return (
    /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ||
    /^rgba?\([^()]+\)$/i.test(trimmed) ||
    /^hsla?\([^()]+\)$/i.test(trimmed) ||
    /^[a-zA-Z]+$/.test(trimmed)
  );
}

function isSafeFontSize(value: string): boolean {
  return /^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i.test(value.trim());
}

function renderTextWithMarks(text: string, marks: unknown): string {
  let output = escapeHtml(text);
  const textStyleParts: string[] = [];

  if (!Array.isArray(marks)) {
    return output;
  }

  for (const mark of marks) {
    if (!isRecord(mark) || typeof mark.type !== "string") {
      continue;
    }

    if (mark.type === "bold") {
      output = `<strong>${output}</strong>`;
    } else if (mark.type === "italic") {
      output = `<em>${output}</em>`;
    } else if (mark.type === "strike") {
      output = `<s>${output}</s>`;
    } else if (mark.type === "underline") {
      output = `<u>${output}</u>`;
    } else if (mark.type === "code") {
      output = `<code>${output}</code>`;
    } else if (mark.type === "highlight") {
      const attrs = isRecord(mark.attrs) ? mark.attrs : {};
      const color =
        typeof attrs.color === "string" && isSafeCssColor(attrs.color)
          ? attrs.color.trim()
          : "#fef08a";
      output = `<mark style="background-color: ${escapeHtml(color)};">${output}</mark>`;
    } else if (mark.type === "textStyle") {
      const attrs = isRecord(mark.attrs) ? mark.attrs : {};

      if (typeof attrs.color === "string" && isSafeCssColor(attrs.color)) {
        textStyleParts.push(`color: ${attrs.color.trim()}`);
      }

      if (typeof attrs.underlineColor === "string" && isSafeCssColor(attrs.underlineColor)) {
        textStyleParts.push(`text-decoration-color: ${attrs.underlineColor.trim()}`);
      }

      if (typeof attrs.fontSize === "string" && isSafeFontSize(attrs.fontSize)) {
        textStyleParts.push(`font-size: ${attrs.fontSize.trim()}`);
      }
    }
  }

  if (textStyleParts.length > 0) {
    output = `<span style="${escapeHtml(textStyleParts.join("; "))}">${output}</span>`;
  }

  return output;
}

function renderTipTapNode(node: unknown): string {
  if (!isRecord(node)) {
    return "";
  }

  const type = typeof node.type === "string" ? node.type : "";
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const children = Array.isArray(node.content) ? node.content : [];
  const renderedChildren = children.map((child) => renderTipTapNode(child)).join("");

  if (type === "text") {
    const text = typeof node.text === "string" ? node.text : "";
    return renderTextWithMarks(text, node.marks);
  }

  if (type === "hardBreak") {
    return "<br/>";
  }

  if (type === "materialLink") {
    const label =
      typeof attrs.label === "string"
        ? attrs.label
        : typeof attrs.fileName === "string"
          ? attrs.fileName
          : typeof attrs.path === "string"
            ? attrs.path
            : "Material";
    return `<span class=\"tp-preview-material-chip\">${escapeHtml(label)}</span>`;
  }

  if (type === "doc") {
    return renderedChildren;
  }

  if (type === "paragraph") {
    return `<p>${renderedChildren || "<br/>"}</p>`;
  }

  if (type === "heading") {
    const level = Number(attrs.level);
    const safeLevel = Number.isFinite(level) && level >= 1 && level <= 3 ? level : 2;
    return `<h${safeLevel}>${renderedChildren}</h${safeLevel}>`;
  }

  if (type === "bulletList") {
    return `<ul>${renderedChildren}</ul>`;
  }

  if (type === "orderedList") {
    return `<ol>${renderedChildren}</ol>`;
  }

  if (type === "listItem") {
    return `<li>${renderedChildren || "<p></p>"}</li>`;
  }

  if (type === "blockquote") {
    return `<blockquote>${renderedChildren}</blockquote>`;
  }

  if (type === "codeBlock") {
    return `<pre><code>${renderedChildren}</code></pre>`;
  }

  if (type === "horizontalRule") {
    return "<hr/>";
  }

  if (type === "table") {
    return `<table>${renderedChildren}</table>`;
  }

  if (type === "tableRow") {
    return `<tr>${renderedChildren}</tr>`;
  }

  if (type === "tableHeader") {
    return `<th>${renderedChildren || ""}</th>`;
  }

  if (type === "tableCell") {
    return `<td>${renderedChildren || ""}</td>`;
  }

  return renderedChildren;
}

function buildLessonPreview(raw: string): LessonPreviewData | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const metadata = isRecord(parsed.metadata) ? parsed.metadata : {};
    const maybeContent = "content" in parsed ? parsed.content : parsed;
    const html = renderTipTapNode(maybeContent).trim() || "<p>(No content)</p>";

    return {
      html,
      teacher: typeof metadata.teacher === "string" && metadata.teacher.trim() ? metadata.teacher : "-",
      subject: typeof metadata.subject === "string" && metadata.subject.trim() ? metadata.subject : "-",
      plannedFor: formatPreviewDate(typeof metadata.plannedFor === "string" ? metadata.plannedFor : null),
      createdAt: formatPreviewDate(typeof metadata.createdAt === "string" ? metadata.createdAt : null),
    };
  } catch {
    return null;
  }
}

function buildMindmapPreview(raw: string): MindmapPreviewData | null {
  try {
    const parsed = JSON.parse(raw) as MindmapData;
    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];

    const nodes: MindmapPreviewNode[] = rawNodes
      .map((node, index) => {
        if (!isRecord(node)) {
          return null;
        }

        const nodeId = typeof node.id === "string" && node.id ? node.id : `node-${index}`;
        const data = isRecord(node.data) ? node.data : {};
        const position = isRecord(node.position) ? node.position : {};
        const styleInput = isRecord(node.style) ? node.style : {};

        const style = Object.entries(styleInput).reduce<CSSProperties>((acc, [key, value]) => {
          if (typeof value === "string" || typeof value === "number") {
            (acc as Record<string, string | number>)[key] = value;
          }
          return acc;
        }, {});

        return {
          id: nodeId,
          label: typeof data.label === "string" && data.label.trim() ? data.label : "New Idea",
          x: typeof position.x === "number" ? position.x : 0,
          y: typeof position.y === "number" ? position.y : 0,
          style,
        };
      })
      .filter((node): node is MindmapPreviewNode => !!node);

    const nodeIds = new Set(nodes.map((node) => node.id));

    const edges: MindmapPreviewEdge[] = rawEdges
      .map((edge, index) => {
        if (!isRecord(edge)) {
          return null;
        }

        const source = typeof edge.source === "string" ? edge.source : "";
        const target = typeof edge.target === "string" ? edge.target : "";
        if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) {
          return null;
        }

        return {
          id: typeof edge.id === "string" && edge.id ? edge.id : `edge-${index}`,
          source,
          target,
        };
      })
      .filter((edge): edge is MindmapPreviewEdge => !!edge);

    return { nodes, edges };
  } catch {
    return null;
  }
}

function MindmapStaticPreview({ data }: { data: MindmapPreviewData }) {
  if (data.nodes.length === 0) {
    return (
      <div className="text-sm text-gray-400 border border-[#2d2d2d] rounded-md p-4 bg-[#101010]">
        This mindmap has no nodes.
      </div>
    );
  }

  const NODE_WIDTH = 190;
  const NODE_HEIGHT = 62;
  const PADDING = 40;

  const minX = Math.min(...data.nodes.map((node) => node.x));
  const minY = Math.min(...data.nodes.map((node) => node.y));
  const maxX = Math.max(...data.nodes.map((node) => node.x));
  const maxY = Math.max(...data.nodes.map((node) => node.y));

  const canvasWidth = Math.max(maxX - minX + NODE_WIDTH + PADDING * 2, 780);
  const canvasHeight = Math.max(maxY - minY + NODE_HEIGHT + PADDING * 2, 440);

  const positionedNodes = data.nodes.map((node) => ({
    ...node,
    left: node.x - minX + PADDING,
    top: node.y - minY + PADDING,
  }));

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));

  return (
    <div className="rounded-md border border-[#2d2d2d] bg-[#101010] overflow-auto">
      <div className="relative" style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          {data.edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) {
              return null;
            }

            return (
              <line
                key={edge.id}
                x1={source.left + NODE_WIDTH / 2}
                y1={source.top + NODE_HEIGHT / 2}
                x2={target.left + NODE_WIDTH / 2}
                y2={target.top + NODE_HEIGHT / 2}
                stroke="#5b6472"
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {positionedNodes.map((node) => {
          const nodeStyle: CSSProperties = {
            position: "absolute",
            left: `${node.left}px`,
            top: `${node.top}px`,
            width: `${NODE_WIDTH}px`,
            minHeight: `${NODE_HEIGHT}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            borderRadius: "8px",
            border: "1px solid #444",
            background: "#2d2d2d",
            color: "#e5e5e5",
            padding: "10px 14px",
            fontSize: "13px",
            fontWeight: 600,
            boxSizing: "border-box",
            overflow: "hidden",
            wordBreak: "break-word",
            ...node.style,
          };

          return (
            <div key={node.id} style={nodeStyle}>
              {node.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    openVault,
    vaultPath,
    lessonPlans,
    mindmaps,
    lessonSearchIndex,
    mindmapSearchIndex,
    isSearchIndexing,
    createNewLesson,
    duplicateLesson,
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
    trashEntries,
    addMaterialFiles,
    addMaterialDirectory,
    deleteMaterialEntry,
    renameMaterialEntry,
    restoreTrashEntry,
    permanentlyDeleteTrashEntry,
    themeMode,
    accentColor,
    setThemeMode,
    setAccentColor,
    lessonPaperTone,
    setLessonPaperTone,
    mindmapPaperTone,
    setMindmapPaperTone,
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
    defaultTeacherName,
    setDefaultTeacherName,
    showActionButtonLabels,
    setShowActionButtonLabels,
  } = useAppStore();

  const [expandedMaterialFolders, setExpandedMaterialFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [materialPreview, setMaterialPreview] = useState<MaterialPreviewState | null>(null);
  const [lessonSearch, setLessonSearch] = useState("");
  const [mindmapSearch, setMindmapSearch] = useState("");
  const [materialSearch, setMaterialSearch] = useState("");
  const [trashSearch, setTrashSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState({
    lessonPlans: false,
    mindmaps: false,
    materials: false,
    trash: false,
  });
  const materialPreviewRef = useRef<HTMLDivElement | null>(null);
  const [expandedTrashFolders, setExpandedTrashFolders] = useState<Record<string, boolean>>({});
  const currentAccentPickerColor = resolveAccentColorValue(accentColor);
  const hasCustomAccent = !Object.prototype.hasOwnProperty.call(ACCENT_PRESET_COLORS, accentColor);

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

  const toggleTrashFolder = (relativePath: string) => {
    setExpandedTrashFolders((previous) => ({
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
        : target.kind === "trash"
          ? 5
        : target.kind === "lesson"
          ? 4
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
      const baseFolder = target.kind === "trash" ? "Trash" : "Materials";
      const absolutePath = await join(vaultPath, baseFolder, ...target.relativePath.split("/").filter(Boolean));
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
    if (
      !contextMenu ||
      (contextMenu.target.kind !== "material" && contextMenu.target.kind !== "trash") ||
      !vaultPath
    ) {
      return;
    }

    const target = contextMenu.target;
    setContextMenu(null);

    try {
      const baseFolder = target.kind === "trash" ? "Trash" : "Materials";
      const absolutePath = await join(vaultPath, baseFolder, ...target.relativePath.split("/").filter(Boolean));
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
    if (
      !contextMenu ||
      (contextMenu.target.kind !== "material" && contextMenu.target.kind !== "trash") ||
      !vaultPath
    ) {
      return;
    }

    const target = contextMenu.target;
    setContextMenu(null);

    if (target.isDirectory) {
      const locationLabel = target.kind === "trash" ? "Trash folder" : "Folder";
      logDebug("sidebar", "preview-skip", `${target.relativePath} is directory`);
      setPreviewState({
        title: target.relativePath,
        kind: "error",
        message: `${locationLabel} preview is not available. Use Reveal In File Manager.`,
      });
      return;
    }

    const fileName = target.relativePath.split("/").pop() || target.relativePath;
    const extension = (fileName.split(".").pop() || "").toLowerCase();

    try {
      const baseFolder = target.kind === "trash" ? "Trash" : "Materials";
      const absolutePath = await join(vaultPath, baseFolder, ...target.relativePath.split("/").filter(Boolean));
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

      if (target.kind === "trash" && extension === "json") {
        const section = target.relativePath.split("/").filter(Boolean)[0] || "";
        const raw = await readTextFile(absolutePath);

        if (section === "Lesson Plans") {
          const lesson = buildLessonPreview(raw);
          if (lesson) {
            setPreviewState({
              title: fileName,
              kind: "lesson",
              lesson,
            });
            logDebug("sidebar", "preview-lesson-rendered", target.relativePath);
            return;
          }
        }

        if (section === "Mindmaps") {
          const mindmap = buildMindmapPreview(raw);
          if (mindmap) {
            setPreviewState({
              title: fileName,
              kind: "mindmap",
              mindmap,
            });
            logDebug("sidebar", "preview-mindmap-rendered", target.relativePath);
            return;
          }
        }
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
      if (confirm(`Move lesson plan \"${target.fileName}\" to Trash?`)) {
        await deleteLesson(target.fileName);
      }
      return;
    }

    if (target.kind === "mindmap") {
      if (confirm(`Move mindmap \"${target.fileName}\" to Trash?`)) {
        await deleteMindmap(target.fileName);
      }
      return;
    }

    if (target.kind === "trash") {
      const label = target.isDirectory ? "folder" : "file";
      if (confirm(`Permanently delete trash ${label} \"${target.relativePath}\"? This cannot be undone.`)) {
        await permanentlyDeleteTrashEntry(target.relativePath, target.isDirectory);
      }
      return;
    }

    const label = target.isDirectory ? "folder" : "file";
    if (confirm(`Move material ${label} \"${target.relativePath}\" to Trash?`)) {
      await deleteMaterialEntry(target.relativePath, target.isDirectory);
    }
  };

  const handleRestoreFromMenu = async () => {
    if (!contextMenu || contextMenu.target.kind !== "trash") return;

    const target = contextMenu.target;
    setContextMenu(null);
    await restoreTrashEntry(target.relativePath, target.isDirectory);
  };

  const handleDuplicateFromMenu = async () => {
    if (!contextMenu || contextMenu.target.kind !== "lesson") return;

    const target = contextMenu.target;
    setContextMenu(null);
    await duplicateLesson(target.fileName);
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

    if (target.kind === "trash") {
      return;
    }

    const currentName = target.relativePath.split("/").pop() || target.relativePath;
    const nextName = prompt("Rename material item", currentName);
    if (!nextName) return;
    await renameMaterialEntry(target.relativePath, nextName);
  };

  const normalizedLessonSearch = lessonSearch.trim().toLowerCase();
  const normalizedMindmapSearch = mindmapSearch.trim().toLowerCase();
  const normalizedMaterialSearch = materialSearch.trim().toLowerCase();
  const normalizedTrashSearch = trashSearch.trim().toLowerCase();

  const filteredLessonPlans = useMemo(() => {
    if (!normalizedLessonSearch) {
      return lessonPlans;
    }

    const scored = lessonPlans
      .filter((entry) => !entry.isDirectory)
      .map((entry) => {
        const name = entry.name || "";
        const nameLower = name.toLowerCase();
        const nameMatch = nameLower.includes(normalizedLessonSearch);
        const contentMatch = (lessonSearchIndex[name] || "").includes(normalizedLessonSearch);
        return { entry, nameMatch, contentMatch };
      })
      .filter((candidate) => candidate.nameMatch || candidate.contentMatch)
      .sort((left, right) => {
        const leftScore = (left.nameMatch ? 2 : 0) + (left.contentMatch ? 1 : 0);
        const rightScore = (right.nameMatch ? 2 : 0) + (right.contentMatch ? 1 : 0);
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        return (left.entry.name || "").localeCompare(right.entry.name || "");
      });

    return scored.map((candidate) => candidate.entry);
  }, [lessonPlans, normalizedLessonSearch, lessonSearchIndex]);

  const filteredMindmaps = useMemo(() => {
    if (!normalizedMindmapSearch) {
      return mindmaps;
    }

    const scored = mindmaps
      .filter((entry) => !entry.isDirectory)
      .map((entry) => {
        const name = entry.name || "";
        const nameLower = name.toLowerCase();
        const nameMatch = nameLower.includes(normalizedMindmapSearch);
        const contentMatch = (mindmapSearchIndex[name] || "").includes(normalizedMindmapSearch);
        return { entry, nameMatch, contentMatch };
      })
      .filter((candidate) => candidate.nameMatch || candidate.contentMatch)
      .sort((left, right) => {
        const leftScore = (left.nameMatch ? 2 : 0) + (left.contentMatch ? 1 : 0);
        const rightScore = (right.nameMatch ? 2 : 0) + (right.contentMatch ? 1 : 0);
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        return (left.entry.name || "").localeCompare(right.entry.name || "");
      });

    return scored.map((candidate) => candidate.entry);
  }, [mindmaps, normalizedMindmapSearch, mindmapSearchIndex]);

  const filterTreeEntries = (entries: MaterialEntry[], query: string): MaterialEntry[] => {
    if (!query) {
      return entries;
    }

    const visit = (entry: MaterialEntry): MaterialEntry | null => {
      const filteredChildren = entry.children
        .map((child) => visit(child))
        .filter((child): child is MaterialEntry => !!child);
      const selfMatch =
        entry.name.toLowerCase().includes(query) || entry.relativePath.toLowerCase().includes(query);

      if (!selfMatch && filteredChildren.length === 0) {
        return null;
      }

      return {
        ...entry,
        children: filteredChildren,
      };
    };

    return entries
      .map((entry) => visit(entry))
      .filter((entry): entry is MaterialEntry => !!entry);
  };

  const visibleMaterials = useMemo(
    () => filterTreeEntries(materials, normalizedMaterialSearch),
    [materials, normalizedMaterialSearch],
  );

  const visibleTrashEntries = useMemo(
    () => filterTreeEntries(trashEntries, normalizedTrashSearch),
    [trashEntries, normalizedTrashSearch],
  );

  const handleSettingsClick = () => {
    if (!sidebarOpen) {
      setSidebarOpen(true);
      setSettingsSection("appearance");
      setSettingsOpen(true);
      return;
    }

    setSettingsOpen((previous) => {
      const next = !previous;
      if (next) {
        setSettingsSection("appearance");
      }
      return next;
    });
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

  const toggleSearchField = (section: "lessonPlans" | "mindmaps" | "materials" | "trash") => {
    setSearchOpen((previous) => {
      const nextOpen = !previous[section];
      if (!nextOpen) {
        if (section === "lessonPlans") {
          setLessonSearch("");
        } else if (section === "mindmaps") {
          setMindmapSearch("");
        } else if (section === "materials") {
          setMaterialSearch("");
        } else {
          setTrashSearch("");
        }
      }
      return {
        ...previous,
        [section]: nextOpen,
      };
    });
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
    <div className={`px-2 flex items-center justify-between text-sm text-gray-400 mb-2 ${marginTop}`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:text-gray-200 hover:bg-[#2d2d2d] transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        <span>{title}</span>
      </button>
      {actions}
    </div>
  );

  const renderMaterialEntries = (entries: typeof materials, depth = 0) =>
    entries.map((entry) => {
      const isExpanded = !!normalizedMaterialSearch || !!expandedMaterialFolders[entry.relativePath];
      const hasChildren = entry.isDirectory && entry.children.length > 0;

      return (
        <li key={entry.relativePath}>
          <button
            draggable
            onDragStart={(event) => handleDragStart(event, entry.relativePath, entry.isDirectory)}
            onDragEnd={(event) => handleDragEnd(event, entry.relativePath, entry.isDirectory)}
            onClick={() => entry.isDirectory && !normalizedMaterialSearch && toggleFolder(entry.relativePath)}
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

  const renderTrashEntries = (entries: MaterialEntry[], depth = 0) =>
    entries.map((entry) => {
      const isExpanded = !!normalizedTrashSearch || !!expandedTrashFolders[entry.relativePath];
      const hasChildren = entry.isDirectory && entry.children.length > 0;

      return (
        <li key={`trash-${entry.relativePath}`}>
          <button
            onClick={() => entry.isDirectory && !normalizedTrashSearch && toggleTrashFolder(entry.relativePath)}
            onContextMenu={(event) =>
              handleItemContextMenu(event, {
                kind: "trash",
                relativePath: entry.relativePath,
                isDirectory: entry.isDirectory,
              })
            }
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors text-left truncate text-amber-200/80 hover:text-amber-100 hover:bg-[#2d2d2d]"
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            title={entry.relativePath}
          >
            {entry.isDirectory ? (
              <>
                <ChevronRight
                  className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 shrink-0 text-amber-300/70" />
                ) : (
                  <Folder className="w-4 h-4 shrink-0 text-amber-300/70" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5 h-3.5 shrink-0" />
                <File className="w-4 h-4 shrink-0 text-amber-300/70" />
              </>
            )}
            <span className="truncate">{entry.name}</span>
          </button>

          {entry.isDirectory && isExpanded && hasChildren && (
            <ul className="space-y-0.5">{renderTrashEntries(entry.children, depth + 1)}</ul>
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
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleSearchField("lessonPlans")}
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${
                    searchOpen.lessonPlans || !!normalizedLessonSearch
                      ? "text-[var(--tp-accent)] bg-[#232323]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                  }`}
                  title={searchOpen.lessonPlans ? "Hide lesson search" : "Show lesson search"}
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => createNewLesson()}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] transition-colors"
                  title="New lesson plan"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ) : null,
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.lessonPlans && (
            <ul className="space-y-1 px-2 mb-4">
              {(searchOpen.lessonPlans || !!normalizedLessonSearch) && (
                <li className="px-1 pb-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={lessonSearch}
                      onChange={(event) => setLessonSearch(event.target.value)}
                      placeholder="Search lesson plans"
                      autoFocus
                      className="w-full bg-[#202020] border border-[#333] rounded-md pl-8 pr-2 py-2 text-xs text-gray-200 outline-none focus:border-[var(--tp-accent)]"
                    />
                  </div>
                  {isSearchIndexing && normalizedLessonSearch && (
                    <div className="text-[10px] text-gray-500 mt-1 px-1">Indexing lesson content...</div>
                  )}
                </li>
              )}
              {filteredLessonPlans.map((entry, idx) => {
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
              {filteredLessonPlans.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">
                  {normalizedLessonSearch ? "No lesson matches" : "No plans yet"}
                </div>
              )}
            </ul>
          )}

          {/* Mindmaps Section */}
          {renderSectionHeader({
            title: "Mindmaps",
            collapsed: sectionCollapsed.mindmaps,
            onToggle: () => toggleSectionCollapsed("mindmaps"),
            actions: vaultPath ? (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleSearchField("mindmaps")}
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${
                    searchOpen.mindmaps || !!normalizedMindmapSearch
                      ? "text-[var(--tp-accent)] bg-[#232323]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                  }`}
                  title={searchOpen.mindmaps ? "Hide mindmap search" : "Show mindmap search"}
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => createNewMindmap()}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] transition-colors"
                  title="New mindmap"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            ) : null,
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.mindmaps && (
            <ul className="space-y-1 px-2 mb-4">
              {(searchOpen.mindmaps || !!normalizedMindmapSearch) && (
                <li className="px-1 pb-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={mindmapSearch}
                      onChange={(event) => setMindmapSearch(event.target.value)}
                      placeholder="Search mindmaps"
                      autoFocus
                      className="w-full bg-[#202020] border border-[#333] rounded-md pl-8 pr-2 py-2 text-xs text-gray-200 outline-none focus:border-[var(--tp-accent)]"
                    />
                  </div>
                  {isSearchIndexing && normalizedMindmapSearch && (
                    <div className="text-[10px] text-gray-500 mt-1 px-1">Indexing mindmap content...</div>
                  )}
                </li>
              )}
              {filteredMindmaps.map((entry, idx) => {
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
              {filteredMindmaps.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">
                  {normalizedMindmapSearch ? "No mindmap matches" : "No mindmaps yet"}
                </div>
              )}
            </ul>
          )}

          {/* Materials Section */}
          {renderSectionHeader({
            title: "Materials",
            collapsed: sectionCollapsed.materials,
            onToggle: () => toggleSectionCollapsed("materials"),
            actions: (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => toggleSearchField("materials")}
                  title={searchOpen.materials ? "Hide material search" : "Show material search"}
                  className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${
                    searchOpen.materials || !!normalizedMaterialSearch
                      ? "text-[var(--tp-accent)] bg-[#232323]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                  }`}
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  onClick={() => addMaterialFiles()}
                  title="Add files"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] transition-colors"
                >
                  <FilePlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => addMaterialDirectory()}
                  title="Add folder"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] transition-colors"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>
            ),
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.materials && (
            <ul className="space-y-1 px-2 pb-4 mb-4">
              {(searchOpen.materials || !!normalizedMaterialSearch) && (
                <li className="px-1 pb-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={materialSearch}
                      onChange={(event) => setMaterialSearch(event.target.value)}
                      placeholder="Search materials (name or path)"
                      autoFocus
                      className="w-full bg-[#202020] border border-[#333] rounded-md pl-8 pr-2 py-2 text-xs text-gray-200 outline-none focus:border-[var(--tp-accent)]"
                    />
                  </div>
                </li>
              )}
              {renderMaterialEntries(visibleMaterials)}
              {visibleMaterials.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">
                  {normalizedMaterialSearch ? "No material matches" : "Empty folder"}
                </div>
              )}
            </ul>
          )}

          {renderSectionHeader({
            title: "Trash",
            collapsed: sectionCollapsed.trash,
            onToggle: () => toggleSectionCollapsed("trash"),
            actions: (
              <button
                onClick={() => toggleSearchField("trash")}
                title={searchOpen.trash ? "Hide trash search" : "Show trash search"}
                className={`h-7 w-7 inline-flex items-center justify-center rounded-md transition-colors ${
                  searchOpen.trash || !!normalizedTrashSearch
                    ? "text-[var(--tp-accent)] bg-[#232323]"
                    : "text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d]"
                }`}
              >
                <Search className="w-4 h-4" />
              </button>
            ),
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.trash && (
            <ul className="space-y-1 px-2 pb-4">
              {(searchOpen.trash || !!normalizedTrashSearch) && (
                <li className="px-1 pb-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={trashSearch}
                      onChange={(event) => setTrashSearch(event.target.value)}
                      placeholder="Search trash"
                      autoFocus
                      className="w-full bg-[#202020] border border-[#333] rounded-md pl-8 pr-2 py-2 text-xs text-gray-200 outline-none focus:border-[var(--tp-accent)]"
                    />
                  </div>
                </li>
              )}
              {renderTrashEntries(visibleTrashEntries)}
              {visibleTrashEntries.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">
                  {normalizedTrashSearch ? "No trash matches" : "Trash is empty"}
                </div>
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
        <div className="tp-settings-panel absolute bottom-20 left-3 z-50 w-[360px] max-w-[calc(100vw-1.5rem)] h-[520px] max-h-[calc(100vh-7rem)] rounded-xl border border-[#343434] bg-[#181818] shadow-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#2d2d2d] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200">Settings</h3>
            <button
              onClick={() => setSettingsOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              Close
            </button>
          </div>

          <div className="p-2 border-b border-[#2d2d2d]">
            <div className="grid grid-cols-3 gap-1 bg-[#141414] border border-[#2a2a2a] rounded-lg p-1">
              <button
                onClick={() => setSettingsSection("appearance")}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  settingsSection === "appearance"
                    ? "bg-[#232323] text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
                }`}
              >
                Appearance
              </button>
              <button
                onClick={() => setSettingsSection("defaults")}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  settingsSection === "defaults"
                    ? "bg-[#232323] text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
                }`}
              >
                Defaults
              </button>
              <button
                onClick={() => setSettingsSection("advanced")}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  settingsSection === "advanced"
                    ? "bg-[#232323] text-white"
                    : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
                }`}
              >
                Advanced
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {settingsSection === "appearance" && (
              <>
                <div>
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
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-gray-400">Custom</label>
                    <input
                      type="color"
                      value={currentAccentPickerColor}
                      onChange={(event) => setAccentColor(event.target.value.toLowerCase())}
                      className={`h-8 w-11 cursor-pointer rounded-md border bg-transparent p-0.5 ${
                        hasCustomAccent ? "border-[var(--tp-accent)]" : "border-[#333]"
                      }`}
                      title="Pick a custom accent color"
                    />
                    <button
                      onClick={() => setAccentColor("blue")}
                      className="ml-auto px-2 py-1 text-xs rounded border border-[#333] text-gray-300 hover:bg-[#222]"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Toolbar Labels</div>
                  <button
                    onClick={() => setShowActionButtonLabels(!showActionButtonLabels)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors ${
                      showActionButtonLabels
                        ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                        : "border-[#333] text-gray-300 hover:bg-[#222]"
                    }`}
                  >
                    <span>Show action button text</span>
                    <span className="text-xs uppercase tracking-wider">{showActionButtonLabels ? "On" : "Off"}</span>
                  </button>
                </div>
              </>
            )}

            {settingsSection === "defaults" && (
              <>
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Default Teacher</div>
                  <input
                    type="text"
                    value={defaultTeacherName}
                    onChange={(e) => setDefaultTeacherName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#202020] border border-[#333] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors"
                  />
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Default Lesson Paper</div>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Controls the writing surface background while editing lesson plans.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {PAPER_TONE_OPTIONS.map((option) => {
                      const isActive = lessonPaperTone === option.value;
                      return (
                        <button
                          key={`lesson-paper-${option.value}`}
                          onClick={() => setLessonPaperTone(option.value)}
                          className={`px-2 py-2 rounded-md text-sm border transition-colors ${
                            isActive
                              ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                              : "border-[#333] text-gray-300 hover:bg-[#222]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Default Mindmap Paper</div>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Controls the mindmap canvas background while brainstorming.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {PAPER_TONE_OPTIONS.map((option) => {
                      const isActive = mindmapPaperTone === option.value;
                      return (
                        <button
                          key={`mindmap-paper-${option.value}`}
                          onClick={() => setMindmapPaperTone(option.value)}
                          className={`px-2 py-2 rounded-md text-sm border transition-colors ${
                            isActive
                              ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                              : "border-[#333] text-gray-300 hover:bg-[#222]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {settingsSection === "advanced" && (
              <div>
                <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Diagnostics</div>
                <button
                  onClick={() => {
                    const next = !debugMode;
                    setDebugMode(next);
                    if (next) {
                      logDebug("debug", "enabled", "Runtime diagnostics ON");
                    }
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors ${
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
            )}
          </div>
        </div>
      )}

      {debugMode && sidebarOpen && !settingsOpen && (
        <div className="tp-debug-console absolute bottom-24 left-3 right-3 z-[55] rounded-lg border border-[#3a3a3a] bg-[#141414] p-2 shadow-xl">
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
          className="tp-menu-surface fixed z-[60] min-w-[170px] rounded-md border border-[#3a3a3a] bg-[#1f1f1f] p-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          {(contextMenu.target.kind === "lesson" || contextMenu.target.kind === "mindmap") && (
            <button
              onClick={handleOpenFromMenu}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
            >
              Open
            </button>
          )}

          {contextMenu.target.kind === "material" && (
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

          {contextMenu.target.kind === "trash" && (
            <>
              <button
                onClick={handleRestoreFromMenu}
                className="w-full text-left px-3 py-2 text-sm text-emerald-300 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </button>
              {!contextMenu.target.isDirectory && (
                <button
                  onClick={handlePreviewFromMenu}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
                >
                  Preview
                </button>
              )}
              <button
                onClick={handleRevealFromMenu}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
              >
                Reveal In File Manager
              </button>
            </>
          )}

          {contextMenu.target.kind !== "trash" && (
            <button
              onClick={handleRenameFromMenu}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
            >
              <Pencil className="w-3.5 h-3.5" /> Rename
            </button>
          )}

          {contextMenu.target.kind === "lesson" && (
            <button
              onClick={handleDuplicateFromMenu}
              className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </button>
          )}

          <button
            onClick={handleDeleteFromMenu}
            className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {contextMenu.target.kind === "trash" ? "Delete Permanently" : "Move to Trash"}
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
            className="tp-preview-surface w-full max-w-5xl max-h-[88vh] bg-[#151515] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
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

              {materialPreview.kind === "lesson" && materialPreview.lesson && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="bg-[#101010] border border-[#2d2d2d] rounded-md px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-gray-500">Teacher</div>
                      <div className="text-sm text-gray-200 truncate">{materialPreview.lesson.teacher}</div>
                    </div>
                    <div className="bg-[#101010] border border-[#2d2d2d] rounded-md px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-gray-500">Subject</div>
                      <div className="text-sm text-gray-200 truncate">{materialPreview.lesson.subject}</div>
                    </div>
                    <div className="bg-[#101010] border border-[#2d2d2d] rounded-md px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-gray-500">Planned For</div>
                      <div className="text-sm text-gray-200 truncate">{materialPreview.lesson.plannedFor}</div>
                    </div>
                    <div className="bg-[#101010] border border-[#2d2d2d] rounded-md px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-gray-500">Created</div>
                      <div className="text-sm text-gray-200 truncate">{materialPreview.lesson.createdAt}</div>
                    </div>
                  </div>

                  <div className="bg-[#121212] border border-[#2d2d2d] rounded-md p-4">
                    <div
                      className="ProseMirror"
                      dangerouslySetInnerHTML={{ __html: materialPreview.lesson.html }}
                    />
                  </div>
                </div>
              )}

              {materialPreview.kind === "mindmap" && materialPreview.mindmap && (
                <MindmapStaticPreview data={materialPreview.mindmap} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

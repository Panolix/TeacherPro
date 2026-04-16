import { ReactNode, useEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from "react";
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
  Bug,
  PanelTopClose,
  PanelTopOpen,
  Search,
  Copy,
  RotateCcw,
  X,
  Sparkles,
  HardDriveDownload,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { AccentColor, MaterialEntry, MindmapData, PaperTone, useAppStore } from "../store";
import { MiniCalendar } from "./MiniCalendar";
import {
  AI_MODEL_CATALOG,
  DEFAULT_AI_MODEL_ID,
  type AiModelCapability,
} from "../ai/modelCatalog";
import { buildContextMenuClassName, clampContextMenuPosition } from "../utils/contextMenu";

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

interface RenameDialogState {
  target: SidebarMenuTarget;
  title: string;
  value: string;
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

interface AiModelInstallProgress {
  model_id: string;
  status: "not-started" | "preparing" | "installing" | "completed" | "failed" | "cancelled";
  progress: number;
  detail?: string | null;
}

interface AiRuntimeModelProcessor {
  model_id: string;
  processor: string;
  size?: string | null;
  until?: string | null;
}

interface AiRuntimeDiagnostics {
  provider: string;
  available: boolean;
  version?: string | null;
  server_running: boolean;
  server_managed_by_app: boolean;
  platform: string;
  architecture: string;
  preferred_backend: string;
  backend_policy: string;
  detected_hardware: string[];
  active_models: AiRuntimeModelProcessor[];
  recommendation?: string | null;
  detail?: string | null;
}

const TERMINAL_INSTALL_STATUSES = new Set<AiModelInstallProgress["status"]>([
  "not-started",
  "completed",
  "failed",
  "cancelled",
]);

const ACCENT_PRESET_COLORS: Record<string, string> = {
  blue: "#2d86a5",
  emerald: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
};

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: "blue", label: "Blue", color: "#2d86a5" },
  { value: "emerald", label: "Emerald", color: "#059669" },
  { value: "rose", label: "Rose", color: "#e11d48" },
  { value: "amber", label: "Amber", color: "#d97706" },
];

const PAPER_TONE_OPTIONS: Array<{ value: PaperTone; label: string }> = [
  { value: "light", label: "White" },
  { value: "dark", label: "Dark" },
];

type SettingsSection = "appearance" | "defaults" | "ai" | "advanced";

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
};

const IMAGE_PREVIEW_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_BY_EXTENSION));

const SIDEBAR_SECTION_ACTION_BUTTON_CLASS =
  "h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#232323] transition-colors";

const SIDEBAR_TOGGLE_ICON_BUTTON_CLASS =
  "h-6 w-6 inline-flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-[#232323] transition-colors";

const AI_MODEL_CAPABILITY_LABELS: Record<AiModelCapability, string> = {
  multilingual: "Multilingual",
  reasoning: "Reasoning",
  "low-latency": "Low-Latency",
  "long-context": "Long-Context",
  "english-focused": "English-Focused",
};

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
    accentColor,
    setAccentColor,
    lessonPaperTone,
    setLessonPaperTone,
    mindmapPaperTone,
    setMindmapPaperTone,
    defaultLessonTableBodyRows,
    setDefaultLessonTableBodyRows,
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
    subjects,
    setSubjects,
    aiEnabled,
    setAiEnabled,
    aiProvider,
    aiDefaultModelId,
    setAiDefaultModelId,
    aiRewriteTranslateModelId,
    setAiRewriteTranslateModelId,
    aiPersistChats,
    setAiPersistChats,
    aiChatHistoryLimit,
    setAiChatHistoryLimit,
    aiTemperature,
    setAiTemperature,
    aiSystemPrompt,
    setAiSystemPrompt,
    aiTranslateTargetLanguage,
    setAiTranslateTargetLanguage,
    aiModelInstallState,
    setAiModelInstallState,
  } = useAppStore();

  const [expandedMaterialFolders, setExpandedMaterialFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<SidebarMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const [materialPreview, setMaterialPreview] = useState<MaterialPreviewState | null>(null);
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
  const [sidebarGlobalSearch, setSidebarGlobalSearch] = useState("");
  const [sidebarSearchCollapsed, setSidebarSearchCollapsed] = useState(false);
  const [materialsActionsOpen, setMaterialsActionsOpen] = useState(false);
  const materialPreviewRef = useRef<HTMLDivElement | null>(null);
  const [expandedTrashFolders, setExpandedTrashFolders] = useState<Record<string, boolean>>({});
  const [aiActionBusy, setAiActionBusy] = useState<string | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [aiInfoMessage, setAiInfoMessage] = useState<string | null>(null);
  const [aiInstalledModelIds, setAiInstalledModelIds] = useState<string[]>([]);
  const [aiInstallProgress, setAiInstallProgress] = useState<Record<string, AiModelInstallProgress>>({});
  const [aiRuntimeDiagnostics, setAiRuntimeDiagnostics] = useState<AiRuntimeDiagnostics | null>(null);
  const [aiRuntimeBusy, setAiRuntimeBusy] = useState(false);
  const aiInstallPollersRef = useRef<Record<string, number>>({});
  const currentAccentPickerColor = resolveAccentColorValue(accentColor);
  const hasCustomAccent = !Object.prototype.hasOwnProperty.call(ACCENT_PRESET_COLORS, accentColor);

  const getModelInstallState = (modelId: string) => aiModelInstallState[modelId] || "not-installed";

  const clearInstallPoller = useCallback((modelId: string) => {
    const timerId = aiInstallPollersRef.current[modelId];
    if (timerId) {
      window.clearInterval(timerId);
      delete aiInstallPollersRef.current[modelId];
    }
  }, []);

  const handleInstallProgressUpdate = useCallback(
    (progress: AiModelInstallProgress) => {
      const modelId = progress.model_id;

      setAiInstallProgress((previous) => ({
        ...previous,
        [modelId]: progress,
      }));

      if (progress.status === "preparing" || progress.status === "installing") {
        setAiModelInstallState(modelId, "installing");
        return;
      }

      if (progress.status === "completed") {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "installed");
        setAiDefaultModelId(modelId);
        setAiInfoMessage(`Installed ${modelId}.`);
        void syncInstalledModels();
        return;
      }

      if (progress.status === "cancelled") {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "not-installed");
        setAiInfoMessage(`Cancelled install for ${modelId}.`);
        return;
      }

      if (progress.status === "failed") {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "error");
        setAiErrorMessage(progress.detail || `Failed to install ${modelId}.`);
      }
    },
    [clearInstallPoller, setAiDefaultModelId, setAiModelInstallState],
  );

  const pollModelInstallProgress = useCallback(
    async (modelId: string) => {
      try {
        const progress = await invoke<AiModelInstallProgress>("ai_get_model_install_progress", { modelId });
        handleInstallProgressUpdate(progress);

        if (TERMINAL_INSTALL_STATUSES.has(progress.status)) {
          clearInstallPoller(modelId);
        }
      } catch (error) {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "error");
        setAiErrorMessage(`Could not track install progress for ${modelId}: ${String(error)}`);
      }
    },
    [clearInstallPoller, handleInstallProgressUpdate, setAiModelInstallState],
  );

  const startInstallPolling = useCallback(
    (modelId: string) => {
      clearInstallPoller(modelId);

      aiInstallPollersRef.current[modelId] = window.setInterval(() => {
        void pollModelInstallProgress(modelId);
      }, 750);

      void pollModelInstallProgress(modelId);
    },
    [clearInstallPoller, pollModelInstallProgress],
  );

  const syncInstalledModels = async () => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy("refresh-models");

    try {
      const installedModels = await invoke<string[]>("ai_list_models");
      const installed = new Set(installedModels || []);
      setAiInstalledModelIds(Array.from(installed));

      for (const model of AI_MODEL_CATALOG) {
        setAiModelInstallState(model.id, installed.has(model.id) ? "installed" : "not-installed");
      }

      // Auto-correct stale routed models if saved selections are no longer installed.
      const currentState = useAppStore.getState();
      const currentChatModel = currentState.aiDefaultModelId;
      const currentRewriteModel = currentState.aiRewriteTranslateModelId;
      const firstCatalogMatch = AI_MODEL_CATALOG.find((m) => installed.has(m.id));
      const corrected = firstCatalogMatch?.id ?? Array.from(installed)[0];

      if (corrected && !installed.has(currentChatModel)) {
        setAiDefaultModelId(corrected);
      }

      if (corrected && !installed.has(currentRewriteModel)) {
        setAiRewriteTranslateModelId(corrected);
      }
    } catch (error) {
      setAiErrorMessage(`Could not refresh models: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const syncRuntimeDiagnostics = async () => {
    setAiRuntimeBusy(true);

    try {
      const diagnostics = await invoke<AiRuntimeDiagnostics>("ai_runtime_diagnostics");
      setAiRuntimeDiagnostics(diagnostics);
    } catch (error) {
      setAiRuntimeDiagnostics(null);
      setAiErrorMessage(`Could not refresh runtime diagnostics: ${String(error)}`);
    } finally {
      setAiRuntimeBusy(false);
    }
  };

  const handleInstallModel = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiModelInstallState(modelId, "installing");
    setAiInstallProgress((previous) => ({
      ...previous,
      [modelId]: {
        model_id: modelId,
        status: "preparing",
        progress: 0,
        detail: "Preparing local runtime...",
      },
    }));

    try {
      const progress = await invoke<AiModelInstallProgress>("ai_start_model_install", { modelId });
      handleInstallProgressUpdate(progress);

      if (!TERMINAL_INSTALL_STATUSES.has(progress.status)) {
        startInstallPolling(modelId);
      }
    } catch (error) {
      setAiModelInstallState(modelId, "error");
      setAiErrorMessage(`Failed to install ${modelId}: ${String(error)}`);
    }
  };

  const handleCancelInstallModel = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy(`cancel:${modelId}`);

    try {
      const progress = await invoke<AiModelInstallProgress>("ai_cancel_model_install", { modelId });
      handleInstallProgressUpdate(progress);
      clearInstallPoller(modelId);
    } catch (error) {
      setAiErrorMessage(`Failed to cancel install for ${modelId}: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const handleRemoveModel = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy(`remove:${modelId}`);

    try {
      await invoke("ai_remove_model", { modelId });
      setAiModelInstallState(modelId, "not-installed");
      if (aiDefaultModelId === modelId) {
        setAiDefaultModelId(DEFAULT_AI_MODEL_ID);
      }
      if (aiRewriteTranslateModelId === modelId) {
        setAiRewriteTranslateModelId(DEFAULT_AI_MODEL_ID);
      }
      setAiInfoMessage(`Removed ${modelId}.`);
      void syncInstalledModels();
    } catch (error) {
      setAiModelInstallState(modelId, "error");
      setAiErrorMessage(`Failed to remove ${modelId}: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const handleEnsureRuntime = async () => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy("ensure-runtime");

    try {
      const result = await invoke<string>("ai_ensure_runtime");
      setAiInfoMessage(result || "Local runtime is ready.");
      void syncRuntimeDiagnostics();
    } catch (error) {
      setAiErrorMessage(`Automatic runtime setup failed: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const modelLabelById = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const model of AI_MODEL_CATALOG) {
      lookup.set(model.id, model.label);
    }
    return lookup;
  }, []);

  const availableRoutingModels = useMemo(() => {
    const ids = new Set<string>(aiInstalledModelIds);

    if (aiDefaultModelId) {
      ids.add(aiDefaultModelId);
    }

    if (aiRewriteTranslateModelId) {
      ids.add(aiRewriteTranslateModelId);
    }

    if (ids.size === 0) {
      ids.add(DEFAULT_AI_MODEL_ID);
    }

    return Array.from(ids).sort((left, right) => {
      const leftIndex = AI_MODEL_CATALOG.findIndex((model) => model.id === left);
      const rightIndex = AI_MODEL_CATALOG.findIndex((model) => model.id === right);

      if (leftIndex !== -1 && rightIndex !== -1) {
        return leftIndex - rightIndex;
      }

      if (leftIndex !== -1) {
        return -1;
      }

      if (rightIndex !== -1) {
        return 1;
      }

      return left.localeCompare(right);
    });
  }, [aiInstalledModelIds, aiDefaultModelId, aiRewriteTranslateModelId]);



  const handleImportGguf = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);

    let selected: string | null = null;
    try {
      const result = await openFileDialog({
        title: "Select a .gguf model file",
        filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
        multiple: false,
        directory: false,
      });
      selected = typeof result === "string" ? result : (result as { path?: string } | null)?.path ?? null;
    } catch {
      // user cancelled the picker
      return;
    }

    if (!selected) return;

    setAiModelInstallState(modelId, "installing");
    setAiInstallProgress((previous) => ({
      ...previous,
      [modelId]: {
        model_id: modelId,
        status: "preparing",
        progress: 0,
        detail: "Preparing runtime for GGUF import...",
      },
    }));

    try {
      const progress = await invoke<AiModelInstallProgress>("ai_import_local_model", {
        ggufPath: selected,
        modelId,
      });
      handleInstallProgressUpdate(progress);

      if (!TERMINAL_INSTALL_STATUSES.has(progress.status)) {
        startInstallPolling(modelId);
      }
    } catch (error) {
      setAiModelInstallState(modelId, "error");
      setAiErrorMessage(`Failed to import ${modelId}: ${String(error)}`);
    }
  };

  useEffect(() => {
    return () => {
      Object.values(aiInstallPollersRef.current).forEach((timerId) => {
        window.clearInterval(timerId);
      });
      aiInstallPollersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== "ai") {
      return;
    }

    void syncInstalledModels();
    void syncRuntimeDiagnostics();
  }, [settingsOpen, settingsSection, aiProvider]);

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
    const closeMenu = () => {
      setContextMenu(null);
      setMaterialsActionsOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setMaterialsActionsOpen(false);
        setRenameDialog(null);
        setPreviewState(null);
        setSettingsOpen(false);
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
    if (sectionCollapsed.materials || !sidebarOpen) {
      setMaterialsActionsOpen(false);
    }
  }, [sectionCollapsed.materials, sidebarOpen]);

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
    const { x, y } = clampContextMenuPosition(event.clientX, event.clientY, {
      estimatedWidth,
      estimatedHeight,
    });

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

      if (IMAGE_PREVIEW_EXTENSIONS.has(extension)) {
        const bytes = await readFile(absolutePath);
        const mimeType = IMAGE_MIME_BY_EXTENSION[extension] || "application/octet-stream";
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
        logDebug(
          "sidebar",
          "preview-image-success",
          `${target.relativePath} | bytes=${bytes.length} | mime=${mimeType}`,
        );
        setPreviewState({
          title: fileName,
          kind: "image",
          src: blobUrl,
          blobUrl,
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
      setRenameDialog({
        target,
        title: "Rename lesson plan",
        value: currentName,
      });
      return;
    }

    if (target.kind === "mindmap") {
      const currentName = target.fileName.replace(/\.json$/i, "");
      setRenameDialog({
        target,
        title: "Rename mindmap",
        value: currentName,
      });
      return;
    }

    if (target.kind === "trash") {
      return;
    }

    const currentName = target.relativePath.split("/").pop() || target.relativePath;
    setRenameDialog({
      target,
      title: "Rename material item",
      value: currentName,
    });
  };

  const handleRenameSubmit = async () => {
    if (!renameDialog) {
      return;
    }

    const nextName = renameDialog.value.trim();
    const target = renameDialog.target;
    setRenameDialog(null);

    if (!nextName) {
      return;
    }

    if (target.kind === "lesson") {
      await renameLesson(target.fileName, nextName);
      return;
    }

    if (target.kind === "mindmap") {
      await renameMindmap(target.fileName, nextName);
      return;
    }

    if (target.kind === "material") {
      await renameMaterialEntry(target.relativePath, nextName);
    }
  };

  const normalizedGlobalSearch = sidebarGlobalSearch.trim().toLowerCase();
  const globalSearchTerms = useMemo(
    () => (normalizedGlobalSearch ? normalizedGlobalSearch.split(/\s+/).filter(Boolean) : []),
    [normalizedGlobalSearch],
  );

  const lessonSearchTerms = globalSearchTerms;
  const mindmapSearchTerms = globalSearchTerms;
  const materialSearchTerms = globalSearchTerms;
  const trashSearchTerms = globalSearchTerms;

  const filteredLessonPlans = useMemo(() => {
    if (lessonSearchTerms.length === 0) {
      return lessonPlans;
    }

    const scored = lessonPlans
      .filter((entry) => !entry.isDirectory)
      .map((entry) => {
        const name = entry.name || "";
        const nameLower = name.toLowerCase();
        const indexedContent = lessonSearchIndex[name] || "";
        const nameMatchCount = lessonSearchTerms.filter((term) => nameLower.includes(term)).length;
        const contentMatchCount = lessonSearchTerms.filter((term) => indexedContent.includes(term)).length;
        const allTermsMatch = lessonSearchTerms.every(
          (term) => nameLower.includes(term) || indexedContent.includes(term),
        );

        return {
          entry,
          nameMatchCount,
          contentMatchCount,
          allTermsMatch,
        };
      })
      .filter((candidate) => candidate.allTermsMatch)
      .sort((left, right) => {
        const leftScore = left.nameMatchCount * 2 + left.contentMatchCount;
        const rightScore = right.nameMatchCount * 2 + right.contentMatchCount;
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        return (left.entry.name || "").localeCompare(right.entry.name || "");
      });

    return scored.map((candidate) => candidate.entry);
  }, [lessonPlans, lessonSearchTerms, lessonSearchIndex]);

  const filteredMindmaps = useMemo(() => {
    if (mindmapSearchTerms.length === 0) {
      return mindmaps;
    }

    const scored = mindmaps
      .filter((entry) => !entry.isDirectory)
      .map((entry) => {
        const name = entry.name || "";
        const nameLower = name.toLowerCase();
        const indexedContent = mindmapSearchIndex[name] || "";
        const nameMatchCount = mindmapSearchTerms.filter((term) => nameLower.includes(term)).length;
        const contentMatchCount = mindmapSearchTerms.filter((term) => indexedContent.includes(term)).length;
        const allTermsMatch = mindmapSearchTerms.every(
          (term) => nameLower.includes(term) || indexedContent.includes(term),
        );

        return {
          entry,
          nameMatchCount,
          contentMatchCount,
          allTermsMatch,
        };
      })
      .filter((candidate) => candidate.allTermsMatch)
      .sort((left, right) => {
        const leftScore = left.nameMatchCount * 2 + left.contentMatchCount;
        const rightScore = right.nameMatchCount * 2 + right.contentMatchCount;
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }
        return (left.entry.name || "").localeCompare(right.entry.name || "");
      });

    return scored.map((candidate) => candidate.entry);
  }, [mindmaps, mindmapSearchTerms, mindmapSearchIndex]);

  const filterTreeEntries = (entries: MaterialEntry[], queries: string[]): MaterialEntry[] => {
    if (queries.length === 0) {
      return entries;
    }

    const visit = (entry: MaterialEntry): MaterialEntry | null => {
      const filteredChildren = entry.children
        .map((child) => visit(child))
        .filter((child): child is MaterialEntry => !!child);
      const nameLower = entry.name.toLowerCase();
      const pathLower = entry.relativePath.toLowerCase();
      const selfMatch = queries.every(
        (query) => nameLower.includes(query) || pathLower.includes(query),
      );

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
    () => filterTreeEntries(materials, materialSearchTerms),
    [materials, materialSearchTerms],
  );

  const visibleTrashEntries = useMemo(
    () => filterTreeEntries(trashEntries, trashSearchTerms),
    [trashEntries, trashSearchTerms],
  );

  const handleSettingsClick = () => {
    setSettingsOpen((previous) => {
      const next = !previous;
      if (next) {
        setSettingsSection("appearance");
      }
      return next;
    });
    setContextMenu(null);
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
    <div className={`px-2 mb-2 ${marginTop}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
        <button
          onClick={onToggle}
          className="h-8 w-full flex items-center gap-2 px-2 rounded-md text-sm text-gray-400 text-left hover:text-gray-200 hover:bg-[#2d2d2d] transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="truncate">{title}</span>
        </button>
        <div className="h-8 min-w-[40px] flex items-center justify-end gap-1">{actions}</div>
      </div>
    </div>
  );

  const renderMaterialEntries = (entries: typeof materials, depth = 0) =>
    entries.map((entry) => {
      const isExpanded = materialSearchTerms.length > 0 || !!expandedMaterialFolders[entry.relativePath];
      const hasChildren = entry.isDirectory && entry.children.length > 0;

      return (
        <li key={entry.relativePath}>
          <button
            draggable
            onDragStart={(event) => handleDragStart(event, entry.relativePath, entry.isDirectory)}
            onDragEnd={(event) => handleDragEnd(event, entry.relativePath, entry.isDirectory)}
            onClick={() => entry.isDirectory && materialSearchTerms.length === 0 && toggleFolder(entry.relativePath)}
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
      const isExpanded = trashSearchTerms.length > 0 || !!expandedTrashFolders[entry.relativePath];
      const hasChildren = entry.isDirectory && entry.children.length > 0;

      return (
        <li key={`trash-${entry.relativePath}`}>
          <button
            onClick={() => entry.isDirectory && trashSearchTerms.length === 0 && toggleTrashFolder(entry.relativePath)}
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
        <div className="px-2 pt-2 border-b border-[#333333] pb-2">
          <button
            onClick={() => setCalendarCollapsed(!calendarCollapsed)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] rounded-md transition-colors"
          >
            <span className="uppercase tracking-wider font-semibold inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Mini Calendar
            </span>
            <span className={SIDEBAR_TOGGLE_ICON_BUTTON_CLASS}>
              {calendarCollapsed ? (
                <PanelTopOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelTopClose className="w-3.5 h-3.5" />
              )}
            </span>
          </button>
        </div>
      )}

      {vaultPath && !calendarCollapsed && <MiniCalendar />}

      {/* Vault Contents */}
      {vaultPath && sidebarOpen && (
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-2 mb-2">
            <button
              onClick={() => setSidebarSearchCollapsed((previous) => !previous)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#2d2d2d] rounded-md transition-colors"
            >
              <span className="uppercase tracking-wider font-semibold inline-flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                Sidebar Search
              </span>
              <span className={SIDEBAR_TOGGLE_ICON_BUTTON_CLASS}>
                {sidebarSearchCollapsed ? (
                  <PanelTopOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelTopClose className="w-3.5 h-3.5" />
                )}
              </span>
            </button>

            {!sidebarSearchCollapsed && (
              <div className="mt-1.5 px-2 pb-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={sidebarGlobalSearch}
                    onChange={(event) => setSidebarGlobalSearch(event.target.value)}
                    placeholder="Search lesson plans, mindmaps, materials, trash"
                    className="w-full bg-[#202020] border border-[#333] rounded-md pl-8 pr-8 py-2 text-xs text-gray-200 outline-none focus:border-[var(--tp-accent)]"
                  />
                  {sidebarGlobalSearch && (
                    <button
                      onClick={() => setSidebarGlobalSearch("")}
                      className="absolute right-1.5 top-1.5 h-6 w-6 inline-flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-[#2a2a2a]"
                      title="Clear sidebar search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Lesson Plans Section */}
          {renderSectionHeader({
            title: "Lesson Plans",
            collapsed: sectionCollapsed.lessonPlans,
            onToggle: () => toggleSectionCollapsed("lessonPlans"),
            actions: vaultPath ? (
              <button
                onClick={() => createNewLesson()}
                className={SIDEBAR_SECTION_ACTION_BUTTON_CLASS}
                title="New lesson plan"
              >
                <Plus className="w-4 h-4" />
              </button>
            ) : null,
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.lessonPlans && (
            <ul className="space-y-1 px-2 mb-4">
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
                  {lessonSearchTerms.length > 0 ? "No lesson matches" : "No plans yet"}
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
              <button
                onClick={() => createNewMindmap()}
                className={SIDEBAR_SECTION_ACTION_BUTTON_CLASS}
                title="New mindmap"
              >
                <Plus className="w-4 h-4" />
              </button>
            ) : null,
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.mindmaps && (
            <ul className="space-y-1 px-2 mb-4">
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
                  {mindmapSearchTerms.length > 0 ? "No mindmap matches" : "No mindmaps yet"}
                </div>
              )}
            </ul>
          )}

          {/* Materials Section */}
          {renderSectionHeader({
            title: "Materials",
            collapsed: sectionCollapsed.materials,
            onToggle: () => {
              setMaterialsActionsOpen(false);
              toggleSectionCollapsed("materials");
            },
            actions: (
              <div
                className="relative"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setMaterialsActionsOpen((previous) => !previous);
                  }}
                  title="Add material"
                  className={SIDEBAR_SECTION_ACTION_BUTTON_CLASS}
                >
                  <Plus className="w-4 h-4" />
                </button>

                {materialsActionsOpen && (
                  <div className="absolute right-0 top-8 z-[60] min-w-[140px] rounded-md border border-[#333] bg-[#171717] shadow-lg p-1">
                    <button
                      onClick={() => {
                        setMaterialsActionsOpen(false);
                        void addMaterialFiles();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-300 hover:text-gray-100 hover:bg-[#232323] transition-colors"
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                      <span>Add files</span>
                    </button>
                    <button
                      onClick={() => {
                        setMaterialsActionsOpen(false);
                        void addMaterialDirectory();
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-300 hover:text-gray-100 hover:bg-[#232323] transition-colors"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Add folder</span>
                    </button>
                  </div>
                )}
              </div>
            ),
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.materials && (
            <ul className="space-y-1 px-2 pb-4 mb-4">
              {renderMaterialEntries(visibleMaterials)}
              {visibleMaterials.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">
                  {materialSearchTerms.length > 0 ? "No material matches" : "Empty folder"}
                </div>
              )}
            </ul>
          )}

          {renderSectionHeader({
            title: "Trash",
            collapsed: sectionCollapsed.trash,
            onToggle: () => toggleSectionCollapsed("trash"),
            actions: null,
            marginTop: "mt-3",
          })}
          {!sectionCollapsed.trash && (
            <ul className="space-y-1 px-2 pb-4">
              {renderTrashEntries(visibleTrashEntries)}
              {visibleTrashEntries.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 italic">
                  {trashSearchTerms.length > 0 ? "No trash matches" : "Trash is empty"}
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

      {settingsOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-4 sm:p-6"
          onClick={() => setSettingsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

          <div
            className="tp-settings-panel relative w-[min(900px,calc(100vw-1.5rem))] h-[min(740px,calc(100vh-1.5rem))] rounded-2xl border border-[#343434] bg-[#181818] shadow-2xl overflow-hidden flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[#2d2d2d] flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-100">Settings</h3>
                <p className="text-xs text-gray-400 mt-1">Customize appearance, defaults, local AI, and diagnostics.</p>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-200 hover:bg-[#232323] transition-colors"
                aria-label="Close settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 pt-3 pb-2 border-b border-[#2d2d2d]">
              <div className="grid grid-cols-4 gap-1.5 bg-[#141414] border border-[#2a2a2a] rounded-lg p-1">
                <button
                  onClick={() => setSettingsSection("appearance")}
                  className={`px-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    settingsSection === "appearance"
                      ? "bg-[#232323] text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
                  }`}
                >
                  Appearance
                </button>
                <button
                  onClick={() => setSettingsSection("defaults")}
                  className={`px-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    settingsSection === "defaults"
                      ? "bg-[#232323] text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
                  }`}
                >
                  Defaults
                </button>
                <button
                  onClick={() => setSettingsSection("ai")}
                  className={`px-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    settingsSection === "ai"
                      ? "bg-[#232323] text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
                  }`}
                >
                  AI
                </button>
                <button
                  onClick={() => setSettingsSection("advanced")}
                  className={`px-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    settingsSection === "advanced"
                      ? "bg-[#232323] text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
                  }`}
                >
                  Advanced
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {settingsSection === "appearance" && (
              <>
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
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase tracking-wider text-gray-500">Subjects</div>
                    {subjects.length < 4 && (
                      <button
                        onClick={() =>
                          setSubjects([...subjects, { name: "", color: "#6366f1" }])
                        }
                        className="text-xs text-[var(--tp-accent)] hover:opacity-80 transition-opacity"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  {subjects.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                      Add up to 4 subjects to quickly tag lessons and color-code your calendar.
                    </p>
                  )}
                  <div className="space-y-2">
                    {subjects.map((subj, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={subj.color}
                          onChange={(e) => {
                            const next = subjects.map((s, i) =>
                              i === idx ? { ...s, color: e.target.value } : s
                            );
                            setSubjects(next);
                          }}
                          className="h-8 w-9 cursor-pointer rounded border border-[#333] bg-transparent p-0.5 shrink-0"
                          title="Subject color"
                        />
                        <input
                          type="text"
                          value={subj.name}
                          onChange={(e) => {
                            const next = subjects.map((s, i) =>
                              i === idx ? { ...s, name: e.target.value } : s
                            );
                            setSubjects(next);
                          }}
                          placeholder="e.g. Mathematics"
                          className="flex-1 bg-[#202020] border border-[#333] rounded px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors"
                        />
                        <button
                          onClick={() => setSubjects(subjects.filter((_, i) => i !== idx))}
                          className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
                          title="Remove subject"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Default Table Body Rows</div>
                  <p className="text-[11px] text-gray-500 mb-2">
                    Controls how many empty body rows are created when you click Insert Lesson Table.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      value={defaultLessonTableBodyRows}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (!Number.isNaN(parsed)) {
                          setDefaultLessonTableBodyRows(parsed);
                        }
                      }}
                      className="w-28 bg-[#202020] border border-[#333] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors"
                    />
                    <button
                      onClick={() => setDefaultLessonTableBodyRows(4)}
                      className="px-2 py-1 text-xs rounded border border-[#333] text-gray-300 hover:bg-[#222]"
                    >
                      Reset
                    </button>
                    <span className="text-[11px] text-gray-500">Allowed: 1-12</span>
                  </div>
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

            {settingsSection === "ai" && (
              <>
                <div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">AI Runtime</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => setAiEnabled(!aiEnabled)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors ${
                        aiEnabled
                          ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                          : "border-[#333] text-gray-300 hover:bg-[#222]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4" /> Enable Local AI
                      </span>
                      <span className="text-xs uppercase tracking-wider">{aiEnabled ? "On" : "Off"}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-[#333] bg-[#1b1b1b] px-3 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-xs uppercase tracking-wider text-gray-500">Runtime Diagnostics</div>
                    <button
                      onClick={() => {
                        void syncRuntimeDiagnostics();
                      }}
                      disabled={aiRuntimeBusy}
                      className="px-2 py-1 text-xs rounded border border-[#333] text-gray-300 hover:bg-[#222] disabled:opacity-60"
                    >
                      {aiRuntimeBusy ? "Refreshing..." : "Refresh Diagnostics"}
                    </button>
                  </div>

                  {aiRuntimeDiagnostics ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="rounded border border-[#2f2f2f] bg-[#202020] px-2 py-1.5">
                          <div className="text-gray-500 uppercase tracking-wider">Runtime</div>
                          <div className={aiRuntimeDiagnostics.available ? "text-emerald-300" : "text-amber-300"}>
                            {aiRuntimeDiagnostics.available ? "Available" : "Unavailable"}
                          </div>
                        </div>
                        <div className="rounded border border-[#2f2f2f] bg-[#202020] px-2 py-1.5">
                          <div className="text-gray-500 uppercase tracking-wider">Server</div>
                          <div className={aiRuntimeDiagnostics.server_running ? "text-emerald-300" : "text-amber-300"}>
                            {aiRuntimeDiagnostics.server_running ? "Running" : "Stopped"}
                          </div>
                        </div>
                        <div className="rounded border border-[#2f2f2f] bg-[#202020] px-2 py-1.5">
                          <div className="text-gray-500 uppercase tracking-wider">Preferred Backend</div>
                          <div className="text-gray-200">{aiRuntimeDiagnostics.preferred_backend.toUpperCase()}</div>
                        </div>
                        <div className="rounded border border-[#2f2f2f] bg-[#202020] px-2 py-1.5">
                          <div className="text-gray-500 uppercase tracking-wider">Platform</div>
                          <div className="text-gray-200">{aiRuntimeDiagnostics.platform}/{aiRuntimeDiagnostics.architecture}</div>
                        </div>
                      </div>

                      {aiRuntimeDiagnostics.version && (
                        <div className="mt-2 text-[11px] text-gray-500">Version: {aiRuntimeDiagnostics.version}</div>
                      )}

                      <div className="mt-1 text-[11px] text-gray-500">
                        Server source: {aiRuntimeDiagnostics.server_managed_by_app ? "TeacherPro-managed" : "External or pre-existing Ollama process"}
                      </div>

                      <div className="mt-1 text-[11px] text-gray-500">
                        Backend policy: {aiRuntimeDiagnostics.backend_policy}
                      </div>

                      {aiRuntimeDiagnostics.detected_hardware.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-[11px] uppercase tracking-wider text-gray-500">Detected Hardware</div>
                          {aiRuntimeDiagnostics.detected_hardware.map((item, index) => (
                            <div key={`hw-${index}`} className="text-[11px] text-gray-300">
                              {item}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 space-y-1">
                        <div className="text-[11px] uppercase tracking-wider text-gray-500">Active Model Processor Usage</div>
                        {aiRuntimeDiagnostics.active_models.length === 0 ? (
                          <div className="text-[11px] text-gray-500">No active models loaded yet.</div>
                        ) : (
                          aiRuntimeDiagnostics.active_models.map((model, index) => {
                            const processorLower = model.processor.toLowerCase();
                            const cpuOnly = processorLower.includes("cpu") && !processorLower.includes("gpu");

                            return (
                              <div
                                key={`model-processor-${model.model_id}-${index}`}
                                className={`text-[11px] rounded border px-2 py-1.5 ${
                                  cpuOnly
                                    ? "border-amber-300/40 bg-amber-400/10 text-amber-200"
                                    : "border-[#2f2f2f] bg-[#202020] text-gray-300"
                                }`}
                              >
                                <span className="text-gray-200">{model.model_id}</span>
                                <span className="text-gray-500">{" -> "}</span>
                                <span>{model.processor}</span>
                                {model.size && <span className="text-gray-500">{` | ${model.size}`}</span>}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {aiRuntimeDiagnostics.recommendation && (
                        <div className="mt-2 text-[11px] text-blue-200 border border-blue-300/25 bg-blue-400/10 rounded-md px-2 py-1.5">
                          {aiRuntimeDiagnostics.recommendation}
                        </div>
                      )}

                      {!aiRuntimeDiagnostics.available && aiRuntimeDiagnostics.detail && (
                        <div className="mt-2 text-[11px] text-amber-300 border border-amber-300/30 bg-amber-400/10 rounded-md px-2 py-1.5">
                          {aiRuntimeDiagnostics.detail}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[11px] text-gray-500">Diagnostics are unavailable until runtime status is checked.</div>
                  )}
                </div>

                <div className="mt-3">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-medium">Model Routing</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Chat Model</label>
                      <select
                        value={aiDefaultModelId}
                        onChange={(e) => setAiDefaultModelId(e.target.value)}
                        className="w-full h-8 px-2 rounded-md bg-[#202020] border border-[#333] text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors appearance-none cursor-pointer"
                      >
                        {availableRoutingModels.map((modelId) => {
                          const isInstalled = aiInstalledModelIds.includes(modelId);
                          const label = modelLabelById.get(modelId) || modelId;
                          return (
                            <option key={`chat-${modelId}`} value={modelId}>
                              {isInstalled ? label : `${label} (not installed)`}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Rewrite + Translate Model</label>
                      <select
                        value={aiRewriteTranslateModelId}
                        onChange={(e) => setAiRewriteTranslateModelId(e.target.value)}
                        className="w-full h-8 px-2 rounded-md bg-[#202020] border border-[#333] text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors appearance-none cursor-pointer"
                      >
                        {availableRoutingModels.map((modelId) => {
                          const isInstalled = aiInstalledModelIds.includes(modelId);
                          const label = modelLabelById.get(modelId) || modelId;
                          return (
                            <option key={`rewrite-${modelId}`} value={modelId}>
                              {isInstalled ? label : `${label} (not installed)`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Use one model for lesson chat and one shared model for both rewrite and translation actions.
                  </p>
                </div>

                <div className="mt-3">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-medium">Chat Behavior</div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Memory (turns)</label>
                      <select
                        value={aiChatHistoryLimit}
                        onChange={(e) => setAiChatHistoryLimit(Number(e.target.value))}
                        className="w-full h-8 px-2 rounded-md bg-[#202020] border border-[#333] text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors appearance-none cursor-pointer"
                      >
                        <option value={4}>4</option>
                        <option value={10}>10</option>
                        <option value={20}>20 (default)</option>
                        <option value={40}>40</option>
                        <option value={9999}>All</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 block mb-1">Creativity</label>
                      <select
                        value={aiTemperature}
                        onChange={(e) => setAiTemperature(Number(e.target.value))}
                        className="w-full h-8 px-2 rounded-md bg-[#202020] border border-[#333] text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors appearance-none cursor-pointer"
                      >
                        <option value={0.1}>Precise (0.1)</option>
                        <option value={0.4}>Focused (0.4)</option>
                        <option value={0.7}>Balanced (0.7)</option>
                        <option value={1.0}>Creative (1.0)</option>
                        <option value={1.4}>Wild (1.4)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => setAiPersistChats(!aiPersistChats)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors mb-2 ${
                      aiPersistChats
                        ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                        : "border-[#333] text-gray-300 hover:bg-[#222]"
                    }`}
                  >
                    <span>Remember chat when switching lessons</span>
                    <span className="text-xs uppercase tracking-wider">{aiPersistChats ? "On" : "Off"}</span>
                  </button>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">
                      Custom AI personality <span className="text-gray-600">(leave blank for default)</span>
                    </label>
                    <textarea
                      value={aiSystemPrompt}
                      onChange={(e) => setAiSystemPrompt(e.target.value)}
                      placeholder="e.g. You are a helpful teaching assistant. Be brief and use simple language."
                      rows={3}
                      className="w-full rounded-md bg-[#202020] border border-[#333] px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-[var(--tp-accent)] resize-none transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-medium">Translation Target</div>
                  <select
                    value={aiTranslateTargetLanguage}
                    onChange={(e) => setAiTranslateTargetLanguage(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-[#202020] border border-[#333] text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="English">English</option>
                    <option value="German">German</option>
                    <option value="French">French</option>
                    <option value="Spanish">Spanish</option>
                    <option value="Italian">Italian</option>
                    <option value="Dutch">Dutch</option>
                    <option value="Portuguese">Portuguese</option>
                    <option value="Russian">Russian</option>
                    <option value="Chinese">Chinese</option>
                    <option value="Japanese">Japanese</option>
                    <option value="Korean">Korean</option>
                    <option value="Turkish">Turkish</option>
                    <option value="Arabic">Arabic</option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">Select the default target language for the 'AI Translate' action in the lesson editor.</p>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => {
                      void handleEnsureRuntime();
                    }}
                    disabled={aiActionBusy === "ensure-runtime"}
                    className="px-2.5 py-1.5 text-xs rounded-md border border-[#3d3d3d] text-gray-300 hover:bg-[#252525] disabled:opacity-60"
                  >
                    {aiActionBusy === "ensure-runtime" ? "Preparing Runtime..." : "Set Up Runtime Automatically"}
                  </button>
                  <span className="text-[11px] text-gray-500">Optional: you can skip this and just press Install on any model.</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase tracking-wider text-gray-500">Model Catalog</div>
                    <button
                      onClick={() => {
                        void syncInstalledModels();
                      }}
                      disabled={aiActionBusy === "refresh-models"}
                      className="px-2 py-1 text-xs rounded border border-[#333] text-gray-300 hover:bg-[#222] disabled:opacity-60"
                    >
                      {aiActionBusy === "refresh-models" ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  {aiInstalledModelIds.length > 0 && (
                    <div className="mb-2 rounded-md border border-[#333] bg-[#202020] px-2.5 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1 font-medium">Detected Installed Models</div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiInstalledModelIds.map((modelId) => (
                          <div key={modelId} className="flex items-center">
                            <button
                              onClick={() => setAiDefaultModelId(modelId)}
                              className={`px-2 py-1 text-[11px] rounded-l border-y border-l transition-colors ${
                                aiDefaultModelId === modelId
                                  ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                                  : "border-[#3d3d3d] text-gray-300 hover:bg-[#252525]"
                              }`}
                              title="Set as chat model"
                            >
                              {modelId}
                            </button>
                            <button
                              onClick={() => {
                                void handleRemoveModel(modelId);
                              }}
                              disabled={aiActionBusy === `remove:${modelId}`}
                              className={`px-1.5 py-1 text-[11px] rounded-r border transition-colors ${
                                aiDefaultModelId === modelId
                                  ? "border-[var(--tp-accent)] border-l-[#3d3d3d] text-gray-400 hover:text-red-400 hover:bg-red-400/10"
                                  : "border-[#3d3d3d] text-gray-400 hover:text-red-400 hover:bg-red-400/10"
                              }`}
                              title={`Remove ${modelId}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {AI_MODEL_CATALOG.map((model) => {
                      const installState = getModelInstallState(model.id);
                      const installProgress = aiInstallProgress[model.id];
                      const isInstalling =
                        installState === "installing" ||
                        installProgress?.status === "preparing" ||
                        installProgress?.status === "installing";
                      const isInstalled = installState === "installed";
                      const isDefault = aiDefaultModelId === model.id;
                      const isCanceling = aiActionBusy === `cancel:${model.id}`;
                      const isRemoving = aiActionBusy === `remove:${model.id}`;
                      const isBusy = isRemoving || isCanceling;
                      const progressValue = Math.max(0, Math.min(100, installProgress?.progress ?? 0));
                      const progressText =
                        installProgress?.detail ||
                        (isInstalling
                          ? `Downloading... ${Math.round(progressValue)}%`
                          : undefined);

                      return (
                        <div key={model.id} className="rounded-lg border border-[#333] bg-[#1b1b1b] px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-gray-100">{model.label}</span>
                                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[#3b3b3b] text-gray-400">
                                  {model.tier}
                                </span>
                                {model.recommended && (
                                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--tp-accent)] text-[var(--tp-accent)]">
                                    Recommended
                                  </span>
                                )}
                                {model.capabilities?.map((capability) => (
                                  <span
                                    key={`${model.id}-capability-${capability}`}
                                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-[#3b3b3b] text-gray-300 bg-[#202020]"
                                  >
                                    {AI_MODEL_CAPABILITY_LABELS[capability]}
                                  </span>
                                ))}
                              </div>
                              <div className="text-sm text-gray-400 mt-1">{model.description}</div>
                              <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                                <span className="inline-flex items-center gap-1"><HardDriveDownload className="w-3 h-3" /> {model.estimatedDisk}</span>
                                <span>RAM/VRAM: {model.recommendedRam}</span>
                                <span>Context: {model.recommendedContext}</span>
                                <span>Source: Ollama</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {isInstalling && <Loader2 className="w-4 h-4 text-[var(--tp-accent)] animate-spin" />}
                              {!isInstalling && installState === "error" && <AlertCircle className="w-4 h-4 text-amber-300" />}
                              {!isInstalling && isInstalled && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
                            </div>
                          </div>

                          {isInstalling && (
                            <div className="mt-2">
                              <div className="h-1.5 w-full rounded bg-[#2a2a2a] overflow-hidden">
                                <div
                                  className="h-full bg-[var(--tp-accent)] transition-all duration-300"
                                  style={{ width: `${Math.max(progressValue, 3)}%` }}
                                />
                              </div>
                              {progressText && <div className="mt-1 text-[11px] text-gray-500 truncate">{progressText}</div>}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {!isInstalled ? (
                              <>
                                <button
                                  onClick={() => { void handleInstallModel(model.id); }}
                                  disabled={isInstalling || isBusy || aiActionBusy === "refresh-models"}
                                  className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--tp-accent)] text-white bg-[#232323] hover:opacity-90 disabled:opacity-60"
                                >
                                  {isInstalling ? "Installing..." : "Install"}
                                </button>
                                <button
                                  onClick={() => { void handleImportGguf(model.id); }}
                                  disabled={isInstalling || isBusy}
                                  className="px-2.5 py-1.5 text-xs rounded-md border border-[#3d3d3d] text-gray-300 hover:bg-[#252525] disabled:opacity-60"
                                >
                                  {isInstalling ? "Importing..." : "Import .gguf"}
                                </button>
                                {isInstalling && (
                                  <button
                                    onClick={() => { void handleCancelInstallModel(model.id); }}
                                    disabled={isCanceling}
                                    className="px-2.5 py-1.5 text-xs rounded-md border border-[#3d3d3d] text-gray-400 hover:bg-[#252525] disabled:opacity-60"
                                  >
                                    {isCanceling ? "Cancelling..." : "Cancel"}
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setAiDefaultModelId(model.id)}
                                  className={`px-2.5 py-1.5 text-xs rounded-md border ${
                                    isDefault
                                      ? "border-[var(--tp-accent)] text-white bg-[#232323]"
                                      : "border-[#3d3d3d] text-gray-300 hover:bg-[#252525]"
                                  }`}
                                >
                                  {isDefault ? "Default" : "Set Default"}
                                </button>
                                <button
                                  onClick={() => { void handleRemoveModel(model.id); }}
                                  disabled={isBusy || isInstalling}
                                  className="px-2.5 py-1.5 text-xs rounded-md border border-[#3d3d3d] text-gray-300 hover:bg-[#252525] disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-gray-500 mt-2">
                    Models are installed via Ollama. Use <strong className="text-gray-400">Install</strong> to download from the Ollama registry, or <strong className="text-gray-400">Import .gguf</strong> to load a file you already downloaded (e.g. from Hugging Face or Kaggle). RAM/VRAM values are practical estimates and vary by context size, quantization, and background apps.
                  </p>

                  {aiInfoMessage && (
                    <div className="mt-2 text-xs text-emerald-300 border border-emerald-300/30 bg-emerald-400/10 rounded-md px-2 py-1.5">
                      {aiInfoMessage}
                    </div>
                  )}

                  {aiErrorMessage && (
                    <div className="mt-2 text-xs text-amber-300 border border-amber-300/30 bg-amber-400/10 rounded-md px-2 py-1.5">
                      {aiErrorMessage}
                    </div>
                  )}
                </div>
              </>
            )}
            </div>
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
          className={buildContextMenuClassName("z-[60] min-w-[170px]")}
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

      {renameDialog && (
        <div
          className="fixed inset-0 z-[72] bg-black/55 flex items-center justify-center p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setRenameDialog(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[#343434] bg-[#181818] shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#2d2d2d]">
              <h3 className="text-sm font-semibold text-gray-200">{renameDialog.title}</h3>
            </div>

            <form
              className="p-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleRenameSubmit();
              }}
            >
              <input
                type="text"
                value={renameDialog.value}
                onChange={(event) =>
                  setRenameDialog((previous) =>
                    previous
                      ? {
                          ...previous,
                          value: event.target.value,
                        }
                      : previous,
                  )
                }
                autoFocus
                className="w-full bg-[#202020] border border-[#333] rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-[var(--tp-accent)]"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenameDialog(null)}
                  className="px-3 py-1.5 text-xs rounded-md border border-[#333] text-gray-300 hover:bg-[#222]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded-md border border-[var(--tp-accent)] text-white bg-[#232323] hover:opacity-90"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
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

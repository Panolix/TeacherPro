import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import {
  readDir,
  DirEntry,
  writeTextFile,
  readTextFile,
  rename,
  mkdir,
  exists,
  copyFile,
  remove,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { load } from '@tauri-apps/plugin-store';
import { DEFAULT_AI_MODEL_ID } from "./ai/modelCatalog";

export interface LessonMetadata {
  teacher: string;
  createdAt: string;
  plannedFor: string | null;
  subject: string;
}

export interface LessonData {
  version: 1;
  metadata: LessonMetadata;
  notes?: string;
  content: any; // TipTap JSON
}

export interface MindmapData {
  version: 1;
  nodes: any[];
  edges: any[];
}

export interface MaterialEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  children: MaterialEntry[];
}

export type VaultRoot = "Lesson Plans" | "Mindmaps" | "Materials";

export interface RecentItem {
  type: "lesson" | "mindmap";
  relativePath: string; // relative to root folder
  openedAt: number;
}

export interface DraggedMaterialRef {
  relativePath: string;
  isDirectory: boolean;
}

export interface PendingMaterialDropRef {
  relativePath: string;
  isDirectory: boolean;
  clientX: number;
  clientY: number;
}

export interface DebugEventEntry {
  id: number;
  timestamp: string;
  source: string;
  action: string;
  detail?: string;
}

export type ThemeMode = "dark" | "light";
export type AccentColor = string;
export type PaperTone = "light" | "dark";
export type SidebarSectionKey = "lessonPlans" | "mindmaps" | "materials" | "trash";
export type AiProvider = "ollama" | "direct-download";
export type AiModelInstallState = "not-installed" | "installing" | "installed" | "error";

export interface SubjectConfig {
  name: string;
  color: string;
}

interface SaveLessonOptions {
  allowRename?: boolean;
}

interface UISettings {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  lessonPaperTone: PaperTone;
  mindmapPaperTone: PaperTone;
  defaultLessonTableBodyRows: number;
  sidebarOpen: boolean;
  lessonZoomMode: "fit" | "fixed";
  lessonZoomFixed: number;
  sidebarSearchCollapsed: boolean;
  expandedMaterialFolders: Record<string, boolean>;
  expandedTrashFolders: Record<string, boolean>;
  calendarCollapsed: boolean;
  sectionCollapsed: Record<SidebarSectionKey, boolean>;
  debugMode: boolean;
  defaultTeacherName: string;
  showActionButtonLabels: boolean;
  subjects: SubjectConfig[];
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiDefaultModelId: string;
  aiRewriteTranslateModelId: string;
  aiPersistChats: boolean;
  aiChatHistoryLimit: number;
  aiTemperature: number;
  aiSystemPrompt: string;
  aiThinkingEnabled: boolean;
  aiTranslateTargetLanguage: string;
}

interface AppState {
  isInitialized: boolean;
  vaultPath: string | null;
  lessonPlans: DirEntry[];
  mindmaps: DirEntry[];
  lessonTree: MaterialEntry[];
  mindmapTree: MaterialEntry[];
  materials: MaterialEntry[];
  trashEntries: MaterialEntry[];
  recents: RecentItem[];
  lessonSearchIndex: Record<string, string>;
  mindmapSearchIndex: Record<string, string>;
  isSearchIndexing: boolean;
  themeMode: ThemeMode;
  accentColor: AccentColor;
  lessonPaperTone: PaperTone;
  mindmapPaperTone: PaperTone;
  defaultLessonTableBodyRows: number;
  sidebarSearchCollapsed: boolean;
  lessonZoomMode: "fit" | "fixed";
  lessonZoomFixed: number;
  expandedMaterialFolders: Record<string, boolean>;
  expandedTrashFolders: Record<string, boolean>;
  calendarCollapsed: boolean;
  sectionCollapsed: Record<SidebarSectionKey, boolean>;
  debugMode: boolean;
  defaultTeacherName: string;
  showActionButtonLabels: boolean;
  subjects: SubjectConfig[];
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiDefaultModelId: string;
  aiRewriteTranslateModelId: string;
  aiPersistChats: boolean;
  aiChatHistoryLimit: number;
  aiTemperature: number;
  aiSystemPrompt: string;
  aiThinkingEnabled: boolean;
  aiTranslateTargetLanguage: string;
  aiModelInstallState: Record<string, AiModelInstallState>;
  lessonSubjectIndex: Record<string, string>;
  debugEvents: DebugEventEntry[];
  draggedMaterial: DraggedMaterialRef | null;
  pendingMaterialDrop: PendingMaterialDropRef | null;
  sidebarOpen: boolean;
  currentView: "editor" | "calendar" | "mindmap";
  activeFilePath: string | null;
  activeFileContent: LessonData | null;
  activeMindmapContent: MindmapData | null;

  /**
   * Bridge that lets the TopBar call Editor-internal actions (save/preview/print/export)
   * and toggle its side panels. Editor registers these on mount; TopBar consumes them.
   */
  editorActions: {
    save: () => void;
    preview: () => void;
    print: () => void;
    export: () => void;
    insertTable: () => void;
    toggleChat: () => void;
    toggleNotes: () => void;
    toggleMethodBank: () => void;
    chatOpen: boolean;
    notesOpen: boolean;
    methodBankOpen: boolean;
    isPdfBusy: boolean;
    aiEnabled: boolean;
  } | null;
  setEditorActions: (actions: AppState["editorActions"]) => void;
  
  initVault: () => Promise<void>;
  setSidebarOpen: (isOpen: boolean) => void;
  setLessonZoomMode: (mode: "fit" | "fixed") => void;
  setLessonZoomFixed: (zoom: number) => void;
  setSidebarSearchCollapsed: (collapsed: boolean) => void;
  setExpandedMaterialFolders: (expandedFolders: Record<string, boolean>) => void;
  setExpandedTrashFolders: (expandedFolders: Record<string, boolean>) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setLessonPaperTone: (tone: PaperTone) => void;
  setMindmapPaperTone: (tone: PaperTone) => void;
  setDefaultLessonTableBodyRows: (rows: number) => void;
  setCalendarCollapsed: (collapsed: boolean) => void;
  toggleSectionCollapsed: (section: SidebarSectionKey) => void;
  setDebugMode: (enabled: boolean) => void;
  setDefaultTeacherName: (name: string) => void;
  setShowActionButtonLabels: (enabled: boolean) => void;
  setSubjects: (subjects: SubjectConfig[]) => void;
  setAiEnabled: (enabled: boolean) => void;
  setAiProvider: (provider: AiProvider) => void;
  setAiDefaultModelId: (modelId: string) => void;
  setAiRewriteTranslateModelId: (modelId: string) => void;
  setAiPersistChats: (enabled: boolean) => void;
  setAiChatHistoryLimit: (limit: number) => void;
  setAiTemperature: (temp: number) => void;
  setAiSystemPrompt: (prompt: string) => void;
  setAiThinkingEnabled: (enabled: boolean) => void;
  setAiTranslateTargetLanguage: (language: string) => void;
  setAiModelInstallState: (modelId: string, state: AiModelInstallState) => void;
  logDebug: (source: string, action: string, detail?: string) => void;
  clearDebugEvents: () => void;
  setDraggedMaterial: (material: DraggedMaterialRef | null) => void;
  setPendingMaterialDrop: (drop: PendingMaterialDropRef | null) => void;
  setCurrentView: (view: "editor" | "calendar" | "mindmap") => void;
  openVault: () => Promise<void>;
  refreshVault: () => Promise<void>;
  createNewLesson: (plannedDate?: Date, subFolder?: string) => Promise<void>;
  createVaultFolder: (folderName: string, parentPath?: string) => Promise<void>;
  duplicateLesson: (fileName: string) => Promise<void>;
  rescheduleLesson: (fileName: string, plannedDate: Date) => Promise<string | null>;
  deleteLesson: (fileName: string) => Promise<void>;
  renameLesson: (oldFileName: string, newName: string) => Promise<void>;
  saveActiveLesson: (
    content: any,
    metadata?: Partial<LessonMetadata>,
    notes?: string,
    options?: SaveLessonOptions,
  ) => Promise<void>;
  openLesson: (fileName: string) => Promise<void>;
  createNewMindmap: (subFolder?: string) => Promise<void>;
  deleteMindmap: (fileName: string) => Promise<void>;
  renameMindmap: (oldFileName: string, newName: string) => Promise<void>;
  saveActiveMindmap: (nodes: any[], edges: any[]) => Promise<void>;
  openMindmap: (fileName: string) => Promise<void>;
  addMaterialFiles: (targetSubFolder?: string) => Promise<string[]>;
  addMaterialDirectory: (targetSubFolder?: string) => Promise<string | null>;
  deleteMaterialEntry: (relativePath: string, isDirectory: boolean) => Promise<void>;
  renameMaterialEntry: (relativePath: string, newName: string) => Promise<void>;
  // Generic vault path operations (any root: Lesson Plans / Mindmaps / Materials)
  renameVaultPath: (root: VaultRoot, relativePath: string, newName: string) => Promise<void>;
  moveVaultPath: (root: VaultRoot, sourceRelative: string, targetFolderRelative: string) => Promise<void>;
  deleteVaultPath: (root: VaultRoot, relativePath: string, isDirectory: boolean) => Promise<void>;
  duplicateVaultPath: (root: VaultRoot, relativePath: string) => Promise<void>;
  // Recents
  addRecent: (item: Omit<RecentItem, "openedAt">) => void;
  clearRecents: () => void;
  restoreTrashEntry: (relativePath: string, isDirectory: boolean) => Promise<void>;
  permanentlyDeleteTrashEntry: (relativePath: string, isDirectory: boolean) => Promise<void>;
}

const STORE_KEY = "teacherpro-settings.json";
const SETTINGS_BACKUP_DIR = ".teacherpro";
const SETTINGS_BACKUP_FILE = "ui-settings.backup.json";

const MIN_DEFAULT_LESSON_TABLE_BODY_ROWS = 1;
const MAX_DEFAULT_LESSON_TABLE_BODY_ROWS = 12;

function clampDefaultLessonTableBodyRows(value: unknown): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return 4;
  }

  return Math.max(
    MIN_DEFAULT_LESSON_TABLE_BODY_ROWS,
    Math.min(MAX_DEFAULT_LESSON_TABLE_BODY_ROWS, Math.round(numericValue)),
  );
}

function normalizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, boolean> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (key.trim().length === 0 || typeof entryValue !== "boolean") {
      continue;
    }
    normalized[key] = entryValue;
  }

  return normalized;
}

const DEFAULT_UI_SETTINGS: UISettings = {
  themeMode: "dark",
  accentColor: "blue",
  lessonPaperTone: "light",
  mindmapPaperTone: "dark",
  defaultLessonTableBodyRows: 4,
  sidebarOpen: true,
  lessonZoomMode: "fit",
  lessonZoomFixed: 1.0,
  sidebarSearchCollapsed: false,
  expandedMaterialFolders: {},
  expandedTrashFolders: {},
  calendarCollapsed: false,
  sectionCollapsed: {
    lessonPlans: false,
    mindmaps: false,
    materials: false,
    trash: false,
  },
  debugMode: false,
  defaultTeacherName: "",
  showActionButtonLabels: false,
  subjects: [],
  aiEnabled: false,
  aiProvider: "ollama",
  aiDefaultModelId: DEFAULT_AI_MODEL_ID,
  aiRewriteTranslateModelId: DEFAULT_AI_MODEL_ID,
  aiPersistChats: true,
  aiChatHistoryLimit: 20,
  aiTemperature: 0.7,
  aiSystemPrompt: "",
  aiThinkingEnabled: true,
  aiTranslateTargetLanguage: "English",
};

function normalizeUiSettings(raw: Partial<UISettings> | null | undefined): UISettings {
  const source = raw || {};
  const legacySource = source as Partial<UISettings> & {
    aiRewriteModelId?: string;
    aiTranslateModelId?: string;
  };
  const sectionSource: Partial<Record<SidebarSectionKey, boolean>> = source.sectionCollapsed || {};
  const rewriteTranslateModelCandidate =
    typeof source.aiRewriteTranslateModelId === "string" && source.aiRewriteTranslateModelId.trim()
      ? source.aiRewriteTranslateModelId
      : typeof legacySource.aiRewriteModelId === "string" && legacySource.aiRewriteModelId.trim()
        ? legacySource.aiRewriteModelId
        : typeof legacySource.aiTranslateModelId === "string" && legacySource.aiTranslateModelId.trim()
          ? legacySource.aiTranslateModelId
          : typeof source.aiDefaultModelId === "string" && source.aiDefaultModelId.trim()
            ? source.aiDefaultModelId
            : DEFAULT_UI_SETTINGS.aiRewriteTranslateModelId;

  return {
    ...DEFAULT_UI_SETTINGS,
    ...source,
    themeMode:
      source.themeMode === "light" || source.themeMode === "dark"
        ? source.themeMode
        : DEFAULT_UI_SETTINGS.themeMode,
    // Lesson paper is fixed to light and mindmap paper is fixed to dark.
    lessonPaperTone: "light",
    mindmapPaperTone: "dark",
    defaultLessonTableBodyRows: clampDefaultLessonTableBodyRows(source.defaultLessonTableBodyRows),
    sidebarOpen:
      typeof source.sidebarOpen === "boolean"
        ? source.sidebarOpen
        : DEFAULT_UI_SETTINGS.sidebarOpen,
    lessonZoomMode:
      source.lessonZoomMode === "fixed" || source.lessonZoomMode === "fit"
        ? source.lessonZoomMode
        : DEFAULT_UI_SETTINGS.lessonZoomMode,
    lessonZoomFixed:
      typeof source.lessonZoomFixed === "number" && Number.isFinite(source.lessonZoomFixed)
        ? Math.max(0.5, Math.min(2.0, source.lessonZoomFixed))
        : DEFAULT_UI_SETTINGS.lessonZoomFixed,
    sidebarSearchCollapsed:
      typeof source.sidebarSearchCollapsed === "boolean"
        ? source.sidebarSearchCollapsed
        : DEFAULT_UI_SETTINGS.sidebarSearchCollapsed,
    expandedMaterialFolders: normalizeBooleanRecord(source.expandedMaterialFolders),
    expandedTrashFolders: normalizeBooleanRecord(source.expandedTrashFolders),
    sectionCollapsed: {
      lessonPlans: sectionSource.lessonPlans ?? DEFAULT_UI_SETTINGS.sectionCollapsed.lessonPlans,
      mindmaps: sectionSource.mindmaps ?? DEFAULT_UI_SETTINGS.sectionCollapsed.mindmaps,
      materials: sectionSource.materials ?? DEFAULT_UI_SETTINGS.sectionCollapsed.materials,
      trash: sectionSource.trash ?? DEFAULT_UI_SETTINGS.sectionCollapsed.trash,
    },
    subjects: Array.isArray(source.subjects) ? source.subjects : DEFAULT_UI_SETTINGS.subjects,
    aiProvider:
      source.aiProvider === "direct-download" || source.aiProvider === "ollama"
        ? source.aiProvider
        : DEFAULT_UI_SETTINGS.aiProvider,
    aiDefaultModelId:
      typeof source.aiDefaultModelId === "string" && source.aiDefaultModelId.trim()
        ? source.aiDefaultModelId
        : DEFAULT_UI_SETTINGS.aiDefaultModelId,
    aiRewriteTranslateModelId: rewriteTranslateModelCandidate,
    aiTranslateTargetLanguage:
      typeof source.aiTranslateTargetLanguage === "string" && source.aiTranslateTargetLanguage.trim()
        ? source.aiTranslateTargetLanguage
        : DEFAULT_UI_SETTINGS.aiTranslateTargetLanguage,
  };
}

async function writeUiSettingsBackup(vaultPath: string, uiSettings: UISettings): Promise<void> {
  const backupDirPath = await join(vaultPath, SETTINGS_BACKUP_DIR);
  await mkdir(backupDirPath, { recursive: true });

  const backupFilePath = await join(backupDirPath, SETTINGS_BACKUP_FILE);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    uiSettings,
  };

  await writeTextFile(backupFilePath, JSON.stringify(payload, null, 2));
}

async function readUiSettingsBackup(vaultPath: string): Promise<Partial<UISettings> | null> {
  try {
    const backupDirPath = await join(vaultPath, SETTINGS_BACKUP_DIR);
    const backupFilePath = await join(backupDirPath, SETTINGS_BACKUP_FILE);
    if (!(await exists(backupFilePath))) {
      return null;
    }

    const raw = await readTextFile(backupFilePath);
    const parsed = JSON.parse(raw) as { uiSettings?: Partial<UISettings> };
    if (!parsed || typeof parsed !== "object" || !parsed.uiSettings) {
      return null;
    }

    return parsed.uiSettings;
  } catch (error) {
    console.warn("Could not read settings backup", error);
    return null;
  }
}

function createTrashName(originalName: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${originalName}`;
}

function stripTrashNamePrefix(trashName: string, section: "Lesson Plans" | "Mindmaps" | "Materials"): string {
  const withoutTimestamp = trashName.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, "");
  if (section !== "Materials") {
    return withoutTimestamp;
  }
  return withoutTimestamp.replace(/^(file|folder)-/, "");
}

function pruneEmptyTrashSections(entries: MaterialEntry[]): MaterialEntry[] {
  const sectionNames = new Set(["Lesson Plans", "Mindmaps", "Materials"]);
  return entries.filter((entry) => !sectionNames.has(entry.name) || entry.children.length > 0);
}

function collectTipTapText(node: unknown, chunks: string[]): void {
  if (!node || typeof node !== "object") {
    return;
  }

  const candidate = node as { text?: unknown; content?: unknown };
  if (typeof candidate.text === "string" && candidate.text.trim()) {
    chunks.push(candidate.text.trim());
  }

  if (Array.isArray(candidate.content)) {
    for (const child of candidate.content) {
      collectTipTapText(child, chunks);
    }
  }
}

function buildLessonSearchText(rawLesson: unknown): string {
  const chunks: string[] = [];

  if (rawLesson && typeof rawLesson === "object") {
    const lesson = rawLesson as {
      metadata?: {
        teacher?: unknown;
        subject?: unknown;
        plannedFor?: unknown;
      };
      notes?: unknown;
      content?: unknown;
    };

    const metadata = lesson.metadata;
    if (metadata) {
      if (typeof metadata.teacher === "string" && metadata.teacher.trim()) {
        chunks.push(metadata.teacher.trim());
      }
      if (typeof metadata.subject === "string" && metadata.subject.trim()) {
        chunks.push(metadata.subject.trim());
      }
      if (typeof metadata.plannedFor === "string" && metadata.plannedFor.trim()) {
        chunks.push(metadata.plannedFor.trim());
      }
    }

    if (typeof lesson.notes === "string" && lesson.notes.trim()) {
      chunks.push(lesson.notes.trim());
    }

    collectTipTapText(lesson.content ?? lesson, chunks);
  }

  return chunks.join(" ").toLowerCase();
}

function buildMindmapSearchText(rawMindmap: unknown): string {
  if (!rawMindmap || typeof rawMindmap !== "object") {
    return "";
  }

  const chunks: string[] = [];
  const mindmap = rawMindmap as {
    nodes?: Array<{ data?: { label?: unknown; materialPath?: unknown; fileName?: unknown } }>;
    edges?: Array<{ label?: unknown }>;
  };

  for (const node of mindmap.nodes || []) {
    const label = node?.data?.label;
    if (typeof label === "string" && label.trim()) {
      chunks.push(label.trim());
    }

    const materialPath = node?.data?.materialPath;
    if (typeof materialPath === "string" && materialPath.trim()) {
      chunks.push(materialPath.trim());
    }

    const fileName = node?.data?.fileName;
    if (typeof fileName === "string" && fileName.trim()) {
      chunks.push(fileName.trim());
    }
  }

  for (const edge of mindmap.edges || []) {
    if (typeof edge?.label === "string" && edge.label.trim()) {
      chunks.push(edge.label.trim());
    }
  }

  return chunks.join(" ").toLowerCase();
}

async function buildLessonSearchIndex(vaultPath: string, lessonEntries: DirEntry[]): Promise<Record<string, string>> {
  const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
  const pairs = await Promise.all(
    lessonEntries
      .filter((entry) => !entry.isDirectory && !!entry.name && entry.name.toLowerCase().endsWith(".json"))
      .map(async (entry) => {
        const fileName = entry.name!;
        const filePath = await join(lessonPlansFolder, fileName);

        try {
          const text = await readTextFile(filePath);
          const parsed = JSON.parse(text) as unknown;
          return [fileName, buildLessonSearchText(parsed)] as const;
        } catch {
          return [fileName, ""] as const;
        }
      }),
  );

  return Object.fromEntries(pairs);
}

async function buildMindmapSearchIndex(vaultPath: string, mindmapEntries: DirEntry[]): Promise<Record<string, string>> {
  const mindmapsFolder = await join(vaultPath, "Mindmaps");
  const pairs = await Promise.all(
    mindmapEntries
      .filter((entry) => !entry.isDirectory && !!entry.name && entry.name.toLowerCase().endsWith(".json"))
      .map(async (entry) => {
        const fileName = entry.name!;
        const filePath = await join(mindmapsFolder, fileName);

        try {
          const text = await readTextFile(filePath);
          const parsed = JSON.parse(text) as unknown;
          return [fileName, buildMindmapSearchText(parsed)] as const;
        } catch {
          return [fileName, ""] as const;
        }
      }),
  );

  return Object.fromEntries(pairs);
}

async function buildLessonSubjectIndex(vaultPath: string, lessonTree: MaterialEntry[]): Promise<Record<string, string>> {
  const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
  const result: Record<string, string> = {};

  // Walk the full tree recursively so nested lessons (e.g. "History/Lesson.json")
  // are indexed by their full relativePath — the same key CalendarView uses.
  const walk = async (entries: MaterialEntry[]) => {
    await Promise.all(entries.map(async (entry) => {
      if (entry.isDirectory) {
        await walk(entry.children);
        return;
      }
      if (!entry.name?.toLowerCase().endsWith(".json")) return;
      const filePath = await join(lessonPlansFolder, entry.relativePath);
      try {
        const text = await readTextFile(filePath);
        const parsed = JSON.parse(text) as { metadata?: { subject?: unknown } };
        const subject = typeof parsed?.metadata?.subject === "string" ? parsed.metadata.subject.trim() : "";
        result[entry.relativePath] = subject;
      } catch {
        result[entry.relativePath] = "";
      }
    }));
  };

  await walk(lessonTree);
  return result;
}

let searchIndexBuildVersion = 0;

async function persistUiSettings(patch: Partial<UISettings>): Promise<void> {
  const store = await load(STORE_KEY, { autoSave: true, defaults: {} });
  const current = (await store.get<Partial<UISettings>>("uiSettings")) || {};
  const mergedSectionCollapsed: Record<SidebarSectionKey, boolean> = {
    lessonPlans:
      patch.sectionCollapsed?.lessonPlans ??
      current.sectionCollapsed?.lessonPlans ??
      DEFAULT_UI_SETTINGS.sectionCollapsed.lessonPlans,
    mindmaps:
      patch.sectionCollapsed?.mindmaps ??
      current.sectionCollapsed?.mindmaps ??
      DEFAULT_UI_SETTINGS.sectionCollapsed.mindmaps,
    materials:
      patch.sectionCollapsed?.materials ??
      current.sectionCollapsed?.materials ??
      DEFAULT_UI_SETTINGS.sectionCollapsed.materials,
    trash:
      patch.sectionCollapsed?.trash ??
      current.sectionCollapsed?.trash ??
      DEFAULT_UI_SETTINGS.sectionCollapsed.trash,
  };

  const next = normalizeUiSettings({
    ...current,
    ...patch,
    sectionCollapsed: mergedSectionCollapsed,
  });

  await store.set("uiSettings", next);
  await store.save();

  const savedVault = await store.get<{ path: string }>("vault");
  if (savedVault?.path) {
    try {
      await writeUiSettingsBackup(savedVault.path, next);
    } catch (error) {
      console.warn("Could not update settings backup", error);
    }
  }
}

const byName = (a: { name?: string }, b: { name?: string }) =>
  (a.name || "").localeCompare(b.name || "");

async function readMaterialTree(
  absolutePath: string,
  relativePrefix = "",
): Promise<MaterialEntry[]> {
  const entries = (await readDir(absolutePath))
    .filter((entry) => entry.name && !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return byName(a, b);
    });

  const tree: MaterialEntry[] = [];

  for (const entry of entries) {
    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      const childPath = await join(absolutePath, entry.name);
      const children = await readMaterialTree(childPath, relativePath);
      tree.push({
        name: entry.name,
        relativePath,
        isDirectory: true,
        children,
      });
    } else {
      tree.push({
        name: entry.name,
        relativePath,
        isDirectory: false,
        children: [],
      });
    }
  }

  return tree;
}

const extractBaseName = (path: string) => path.split(/[\/\\]/).pop() || path;

async function ensureUniqueTargetPath(targetDirectory: string, fileName: string): Promise<string> {
  let candidate = await join(targetDirectory, fileName);
  let suffix = 1;

  while (await exists(candidate)) {
    const dotIndex = fileName.lastIndexOf(".");
    const hasExtension = dotIndex > 0;
    const stem = hasExtension ? fileName.slice(0, dotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(dotIndex) : "";
    const nextName = `${stem}-${suffix}${extension}`;
    candidate = await join(targetDirectory, nextName);
    suffix += 1;
  }

  return candidate;
}

async function copyDirectoryRecursive(sourceDir: string, destinationDir: string): Promise<void> {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readDir(sourceDir);

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith(".")) {
      continue;
    }

    const sourcePath = await join(sourceDir, entry.name);
    const destinationPath = await join(destinationDir, entry.name);

    if (entry.isDirectory) {
      await copyDirectoryRecursive(sourcePath, destinationPath);
    } else {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function movePathToTrash(
  vaultPath: string,
  sourcePath: string,
  trashSection: "Lesson Plans" | "Mindmaps" | "Materials",
  originalName: string,
): Promise<boolean> {
  if (!(await exists(sourcePath))) {
    return false;
  }

  const trashRoot = await join(vaultPath, "Trash", trashSection);
  await mkdir(trashRoot, { recursive: true });

  const trashName = createTrashName(originalName);
  const trashTargetPath = await ensureUniqueTargetPath(trashRoot, trashName);

  try {
    await rename(sourcePath, trashTargetPath);
    return true;
  } catch (error) {
    // During rapid bulk actions the file may already have been moved by a prior pass.
    if (!(await exists(sourcePath))) {
      return false;
    }
    throw error;
  }
}

function createPlannedForIso(plannedDate: Date): string {
  const localNoon = new Date(
    plannedDate.getFullYear(),
    plannedDate.getMonth(),
    plannedDate.getDate(),
    12,
    0,
    0,
    0,
  );
  return localNoon.toISOString();
}

function buildLessonFileNameForMetadata(currentFileName: string, metadata: LessonMetadata): string {
  const sourceDate = metadata.plannedFor || metadata.createdAt;
  const dateStr = sourceDate.split("T")[0];
  const subject = metadata.subject.trim();

  // Preserve folder prefix (e.g. "History/") if the file lives in a subfolder
  const lastSlash = currentFileName.lastIndexOf("/");
  const folderPrefix = lastSlash >= 0 ? currentFileName.slice(0, lastSlash + 1) : "";
  const baseName = lastSlash >= 0 ? currentFileName.slice(lastSlash + 1) : currentFileName;

  if (subject) {
    const sanitizedSubject = subject.replace(/[^a-zA-Z0-9\-_ ]/g, "").replace(/\s+/g, "-");
    return `${folderPrefix}${dateStr}-${sanitizedSubject}.json`;
  }

  const datePattern = /\d{4}-\d{2}-\d{2}/;
  if (datePattern.test(baseName)) {
    return `${folderPrefix}${baseName.replace(datePattern, dateStr)}`;
  }

  const id = Date.now().toString().slice(-4);
  return `${folderPrefix}Lesson-${dateStr}-${id}.json`;
}

function subjectToLessonFileToken(subject: string): string {
  return subject.trim().replace(/[^a-zA-Z0-9\-_ ]/g, "").replace(/\s+/g, "-");
}

function fallbackSubjectFromLessonFileName(fileName: string, subjects: SubjectConfig[]): string {
  // Strip folder prefix before pattern matching
  const baseName = fileName.split("/").pop() || fileName;
  const stem = baseName.replace(/\.json$/i, "");
  const match = stem.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  if (!match) {
    return "";
  }

  const token = match[1].trim();
  if (!token || /^\d+$/.test(token)) {
    return "";
  }

  const subjectFromSettings = subjects.find((entry) => subjectToLessonFileToken(entry.name) === token);
  if (subjectFromSettings) {
    return subjectFromSettings.name;
  }

  return token.replace(/-/g, " ");
}

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  vaultPath: null,
  lessonPlans: [],
  mindmaps: [],
  lessonTree: [],
  mindmapTree: [],
  materials: [],
  trashEntries: [],
  recents: (() => {
    try {
      const raw = localStorage.getItem("tp-recents");
      if (raw) return JSON.parse(raw) as RecentItem[];
    } catch {}
    return [];
  })(),
  lessonSearchIndex: {},
  mindmapSearchIndex: {},
  isSearchIndexing: false,
  themeMode: DEFAULT_UI_SETTINGS.themeMode,
  accentColor: DEFAULT_UI_SETTINGS.accentColor,
  lessonPaperTone: DEFAULT_UI_SETTINGS.lessonPaperTone,
  mindmapPaperTone: DEFAULT_UI_SETTINGS.mindmapPaperTone,
  defaultLessonTableBodyRows: DEFAULT_UI_SETTINGS.defaultLessonTableBodyRows,
  sidebarOpen: DEFAULT_UI_SETTINGS.sidebarOpen,
  lessonZoomMode: DEFAULT_UI_SETTINGS.lessonZoomMode,
  lessonZoomFixed: DEFAULT_UI_SETTINGS.lessonZoomFixed,
  sidebarSearchCollapsed: DEFAULT_UI_SETTINGS.sidebarSearchCollapsed,
  expandedMaterialFolders: DEFAULT_UI_SETTINGS.expandedMaterialFolders,
  expandedTrashFolders: DEFAULT_UI_SETTINGS.expandedTrashFolders,
  calendarCollapsed: DEFAULT_UI_SETTINGS.calendarCollapsed,
  sectionCollapsed: DEFAULT_UI_SETTINGS.sectionCollapsed,
  debugMode: DEFAULT_UI_SETTINGS.debugMode,
  defaultTeacherName: DEFAULT_UI_SETTINGS.defaultTeacherName,
  showActionButtonLabels: DEFAULT_UI_SETTINGS.showActionButtonLabels,
  subjects: DEFAULT_UI_SETTINGS.subjects,
  aiEnabled: DEFAULT_UI_SETTINGS.aiEnabled,
  aiProvider: DEFAULT_UI_SETTINGS.aiProvider,
  aiDefaultModelId: DEFAULT_UI_SETTINGS.aiDefaultModelId,
  aiRewriteTranslateModelId: DEFAULT_UI_SETTINGS.aiRewriteTranslateModelId,
  aiPersistChats: DEFAULT_UI_SETTINGS.aiPersistChats,
  aiChatHistoryLimit: DEFAULT_UI_SETTINGS.aiChatHistoryLimit,
  aiTemperature: DEFAULT_UI_SETTINGS.aiTemperature,
  aiSystemPrompt: DEFAULT_UI_SETTINGS.aiSystemPrompt,
  aiThinkingEnabled: DEFAULT_UI_SETTINGS.aiThinkingEnabled,
  aiTranslateTargetLanguage: DEFAULT_UI_SETTINGS.aiTranslateTargetLanguage,
  aiModelInstallState: {},
  lessonSubjectIndex: {},
  debugEvents: [],
  draggedMaterial: null,
  pendingMaterialDrop: null,
  currentView: "editor",
  activeFilePath: null,
  activeFileContent: null,
  activeMindmapContent: null,

  initVault: async () => {
    try {
      const store = await load(STORE_KEY, { autoSave: true, defaults: {} });
      const savedVault = await store.get<{ path: string }>("vault");
      const savedSettings = await store.get<Partial<UISettings>>("uiSettings");
      let loadedSettings = savedSettings || null;

      if (!loadedSettings && savedVault?.path) {
        loadedSettings = await readUiSettingsBackup(savedVault.path);
      }

      const normalizedSettings = normalizeUiSettings(loadedSettings);
      set({
        themeMode: normalizedSettings.themeMode,
        accentColor: normalizedSettings.accentColor,
        lessonPaperTone: normalizedSettings.lessonPaperTone,
        mindmapPaperTone: normalizedSettings.mindmapPaperTone,
        defaultLessonTableBodyRows: normalizedSettings.defaultLessonTableBodyRows,
        sidebarOpen: normalizedSettings.sidebarOpen,
        lessonZoomMode: normalizedSettings.lessonZoomMode,
        lessonZoomFixed: normalizedSettings.lessonZoomFixed,
        sidebarSearchCollapsed: normalizedSettings.sidebarSearchCollapsed,
        expandedMaterialFolders: normalizedSettings.expandedMaterialFolders,
        expandedTrashFolders: normalizedSettings.expandedTrashFolders,
        calendarCollapsed: normalizedSettings.calendarCollapsed,
        sectionCollapsed: normalizedSettings.sectionCollapsed,
        debugMode: normalizedSettings.debugMode,
        defaultTeacherName: normalizedSettings.defaultTeacherName,
        showActionButtonLabels: normalizedSettings.showActionButtonLabels,
        subjects: normalizedSettings.subjects,
        aiEnabled: normalizedSettings.aiEnabled,
        aiProvider: normalizedSettings.aiProvider,
        aiDefaultModelId: normalizedSettings.aiDefaultModelId,
        aiRewriteTranslateModelId: normalizedSettings.aiRewriteTranslateModelId,
        aiPersistChats: normalizedSettings.aiPersistChats,
        aiChatHistoryLimit: normalizedSettings.aiChatHistoryLimit,
        aiTemperature: normalizedSettings.aiTemperature,
        aiSystemPrompt: normalizedSettings.aiSystemPrompt,
        aiThinkingEnabled: normalizedSettings.aiThinkingEnabled,
        aiTranslateTargetLanguage: normalizedSettings.aiTranslateTargetLanguage,
      });

      if (!savedSettings && loadedSettings) {
        await store.set("uiSettings", normalizedSettings);
        await store.save();
      }
      
      if (savedVault && savedVault.path) {
        try {
          await writeUiSettingsBackup(savedVault.path, normalizedSettings);
        } catch (error) {
          console.warn("Could not refresh settings backup", error);
        }

        set({ vaultPath: savedVault.path });
        await get().refreshVault();
      }
    } catch (e) {
      console.warn("Failed to load vault from store", e);
    } finally {
      set({ isInitialized: true });
    }
  },

  setSidebarOpen: (isOpen) => {
    set({ sidebarOpen: isOpen });
    void persistUiSettings({ sidebarOpen: isOpen });
  },
  setLessonZoomMode: (mode) => {
    set({ lessonZoomMode: mode });
    void persistUiSettings({ lessonZoomMode: mode });
  },
  setLessonZoomFixed: (zoom) => {
    const clamped = Math.max(0.5, Math.min(2.0, zoom));
    set({ lessonZoomMode: "fixed", lessonZoomFixed: clamped });
    void persistUiSettings({ lessonZoomMode: "fixed", lessonZoomFixed: clamped });
  },
  setSidebarSearchCollapsed: (collapsed) => {
    set({ sidebarSearchCollapsed: collapsed });
    void persistUiSettings({ sidebarSearchCollapsed: collapsed });
  },
  setExpandedMaterialFolders: (expandedFolders) => {
    set({ expandedMaterialFolders: expandedFolders });
    void persistUiSettings({ expandedMaterialFolders: expandedFolders });
  },
  setExpandedTrashFolders: (expandedFolders) => {
    set({ expandedTrashFolders: expandedFolders });
    void persistUiSettings({ expandedTrashFolders: expandedFolders });
  },
  setThemeMode: (mode) => {
    set({ themeMode: mode });
    void persistUiSettings({ themeMode: mode });
  },
  setAccentColor: (color) => {
    set({ accentColor: color });
    void persistUiSettings({ accentColor: color });
  },
  setLessonPaperTone: (tone) => {
    void tone;
    set({ lessonPaperTone: "light" });
    void persistUiSettings({ lessonPaperTone: "light" });
  },
  setMindmapPaperTone: (tone) => {
    void tone;
    set({ mindmapPaperTone: "dark" });
    void persistUiSettings({ mindmapPaperTone: "dark" });
  },
  setDefaultLessonTableBodyRows: (rows) => {
    const clampedRows = clampDefaultLessonTableBodyRows(rows);
    set({ defaultLessonTableBodyRows: clampedRows });
    void persistUiSettings({ defaultLessonTableBodyRows: clampedRows });
  },
  setCalendarCollapsed: (collapsed) => {
    set({ calendarCollapsed: collapsed });
    void persistUiSettings({ calendarCollapsed: collapsed });
  },
  toggleSectionCollapsed: (section) => {
    const current = get().sectionCollapsed;
    const next = {
      ...current,
      [section]: !current[section],
    };
    set({ sectionCollapsed: next });
    void persistUiSettings({ sectionCollapsed: next });
  },
  setDebugMode: (enabled) => {
    set({ debugMode: enabled });
    void persistUiSettings({ debugMode: enabled });
  },
  setDefaultTeacherName: (name) => {
    set({ defaultTeacherName: name });
    void persistUiSettings({ defaultTeacherName: name });
  },
  setShowActionButtonLabels: (enabled) => {
    set({ showActionButtonLabels: enabled });
    void persistUiSettings({ showActionButtonLabels: enabled });
  },
  setSubjects: (subjects) => {
    set({ subjects });
    void persistUiSettings({ subjects });
  },
  setAiEnabled: (enabled) => {
    set({ aiEnabled: enabled });
    void persistUiSettings({ aiEnabled: enabled });
  },
  setAiProvider: (provider) => {
    set({ aiProvider: provider });
    void persistUiSettings({ aiProvider: provider });
  },
  setAiDefaultModelId: (modelId) => {
    set({ aiDefaultModelId: modelId });
    void persistUiSettings({ aiDefaultModelId: modelId });
  },
  setAiRewriteTranslateModelId: (modelId) => {
    set({ aiRewriteTranslateModelId: modelId });
    void persistUiSettings({ aiRewriteTranslateModelId: modelId });
  },
  setAiPersistChats: (enabled) => {
    set({ aiPersistChats: enabled });
    void persistUiSettings({ aiPersistChats: enabled });
  },
  setAiChatHistoryLimit: (limit) => {
    set({ aiChatHistoryLimit: limit });
    void persistUiSettings({ aiChatHistoryLimit: limit });
  },
  setAiTemperature: (temp) => {
    set({ aiTemperature: temp });
    void persistUiSettings({ aiTemperature: temp });
  },
  setAiSystemPrompt: (prompt) => {
    set({ aiSystemPrompt: prompt });
    void persistUiSettings({ aiSystemPrompt: prompt });
  },
  setAiThinkingEnabled: (enabled) => {
    set({ aiThinkingEnabled: enabled });
    void persistUiSettings({ aiThinkingEnabled: enabled });
  },
  setAiTranslateTargetLanguage: (language) => {
    set({ aiTranslateTargetLanguage: language });
    void persistUiSettings({ aiTranslateTargetLanguage: language });
  },
  setAiModelInstallState: (modelId, installState) => {
    set((state) => ({
      aiModelInstallState: {
        ...state.aiModelInstallState,
        [modelId]: installState,
      },
    }));
  },
  logDebug: (source, action, detail) => {
    const { debugMode } = get();
    if (!debugMode) {
      return;
    }

    const entry: DebugEventEntry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      timestamp: new Date().toLocaleTimeString(),
      source,
      action,
      detail,
    };

    set((state) => ({
      debugEvents: [entry, ...state.debugEvents].slice(0, 120),
    }));
  },
  clearDebugEvents: () => set({ debugEvents: [] }),
  setDraggedMaterial: (material) => set({ draggedMaterial: material }),
  setPendingMaterialDrop: (drop) => set({ pendingMaterialDrop: drop }),
  setCurrentView: (view) => set({ currentView: view }),
  editorActions: null,
  setEditorActions: (actions) => set({ editorActions: actions }),

  openVault: async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select TeacherPro Vault",
      });

      if (selected && typeof selected === "string") {
        set({ vaultPath: selected, activeFilePath: null, activeFileContent: null, currentView: "editor" });
        
        // Save persistent store
        try {
          const store = await load(STORE_KEY, { autoSave: true, defaults: {} });
          await store.set("vault", { path: selected });

          const currentSettings = await store.get<Partial<UISettings>>("uiSettings");
          const normalizedSettings = normalizeUiSettings(currentSettings);
          await store.set("uiSettings", normalizedSettings);
          await store.save();

          await writeUiSettingsBackup(selected, normalizedSettings);
        } catch(e) {
          console.error("Could not persist vault path", e);
        }

        await get().refreshVault();
      }
    } catch (error) {
      console.error("Failed to open vault:", error);
    }
  },

  refreshVault: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    const folders = ["Lesson Plans", "Mindmaps", "Materials", "Exports", "Trash"];
    
    try {
      // Ensure directory structure
      for (const folder of folders) {
        const folderPath = await join(vaultPath, folder);
        const dirExists = await exists(folderPath);
        if (!dirExists) {
          await mkdir(folderPath, { recursive: true });
        }
      }

      // Read folders
      const lessonPlansPath = await join(vaultPath, "Lesson Plans");
      const lpEntries = await readDir(lessonPlansPath);
      const lpFiltered = lpEntries.filter(e => !e.name?.startsWith(".")).sort(byName);

      const mindmapsPath = await join(vaultPath, "Mindmaps");
      const mmEntries = await readDir(mindmapsPath);
      const mmFiltered = mmEntries.filter(e => !e.name?.startsWith(".")).sort(byName);

      const materialsPath = await join(vaultPath, "Materials");
      const materialTree = await readMaterialTree(materialsPath);

      const lessonTree = await readMaterialTree(lessonPlansPath);
      const mindmapTree = await readMaterialTree(mindmapsPath);

      const trashPath = await join(vaultPath, "Trash");
      const trashTree = pruneEmptyTrashSections(await readMaterialTree(trashPath));

      const buildVersion = ++searchIndexBuildVersion;
      
      set({ 
        lessonPlans: lpFiltered,
        mindmaps: mmFiltered,
        lessonTree,
        mindmapTree,
        materials: materialTree,
        trashEntries: trashTree,
        isSearchIndexing: true,
      });

      void (async () => {
        try {
          const [nextLessonIndex, nextMindmapIndex, nextSubjectIndex] = await Promise.all([
            buildLessonSearchIndex(vaultPath, lpFiltered),
            buildMindmapSearchIndex(vaultPath, mmFiltered),
            buildLessonSubjectIndex(vaultPath, lessonTree),
          ]);

          if (buildVersion !== searchIndexBuildVersion) {
            return;
          }

          set({
            lessonSearchIndex: nextLessonIndex,
            mindmapSearchIndex: nextMindmapIndex,
            lessonSubjectIndex: nextSubjectIndex,
            isSearchIndexing: false,
          });
        } catch (indexError) {
          console.warn("Failed to build search index", indexError);
          if (buildVersion === searchIndexBuildVersion) {
            set({ isSearchIndexing: false });
          }
        }
      })();
    } catch (error) {
      console.error("Failed to refresh vault contents:", error);
      set({ isSearchIndexing: false });
    }
  },

  createVaultFolder: async (folderName: string, parentPath?: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    try {
      const trimmed = folderName.trim();
      if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) {
        alert("Invalid folder name");
        return;
      }
      const base = parentPath
        ? await join(vaultPath, ...parentPath.split("/").filter(Boolean))
        : await join(vaultPath, "Lesson Plans");
      const newFolderPath = await join(base, trimmed);
      if (await exists(newFolderPath)) {
        alert("A folder with that name already exists");
        return;
      }
      await mkdir(newFolderPath, { recursive: true });
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to create folder:", error);
      alert("Error creating folder: " + String(error));
    }
  },

  createNewLesson: async (plannedDate?: Date, subFolder?: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const { defaultTeacherName } = get();
      // Use local date string to avoid UTC timezone shift
      const now = new Date();
      const dateToUse = plannedDate || now;
      const year = dateToUse.getFullYear();
      const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
      const day = String(dateToUse.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const fileName = `Lesson-${dateStr}-${Date.now().toString().slice(-4)}.json`;
      const lessonPlansFolder = subFolder
        ? await join(vaultPath, "Lesson Plans", ...subFolder.split("/").filter(Boolean))
        : await join(vaultPath, "Lesson Plans");
      // Ensure folder exists
      if (!(await exists(lessonPlansFolder))) {
        await mkdir(lessonPlansFolder, { recursive: true });
      }
      const filePath = await join(lessonPlansFolder, fileName);
      
      const initialContent: LessonData = {
        version: 1,
        metadata: {
          teacher: defaultTeacherName,
          createdAt: now.toISOString(),
          plannedFor: dateToUse.toISOString(),
          subject: ""
        },
        notes: "",
        content: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "New Lesson Plan" }] }
          ]
        }
      };
      
      await writeTextFile(filePath, JSON.stringify(initialContent, null, 2));
      set({
        activeFilePath: filePath,
        activeFileContent: initialContent,
        currentView: "editor",
      });
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to create new lesson:", error);
      alert("Error creating lesson: " + String(error));
    }
  },

  duplicateLesson: async (fileName: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const sourcePath = await join(lessonPlansFolder, fileName);
      const sourceText = await readTextFile(sourcePath);

      const stem = fileName.replace(/\.json$/i, "");
      const duplicateBaseName = `${stem} (Copy).json`;
      const destinationPath = await ensureUniqueTargetPath(lessonPlansFolder, duplicateBaseName);
      const duplicatedFileName = extractBaseName(destinationPath);

      let nextText = sourceText;
      try {
        const parsed = JSON.parse(sourceText) as Partial<LessonData>;
        if (parsed && parsed.metadata) {
          parsed.metadata.createdAt = new Date().toISOString();
          nextText = JSON.stringify(parsed, null, 2);
        }
      } catch {
        // Keep original content for legacy/non-standard files.
      }

      await writeTextFile(destinationPath, nextText);
      await get().refreshVault();
      await get().openLesson(duplicatedFileName);
    } catch (error) {
      console.error("Failed to duplicate lesson:", error);
      alert("Error duplicating lesson: " + String(error));
    }
  },

  rescheduleLesson: async (fileName: string, plannedDate: Date) => {
    const { vaultPath, activeFilePath, defaultTeacherName, lessonSubjectIndex, subjects } = get();
    if (!vaultPath) return null;

    try {
      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const sourcePath = await join(lessonPlansFolder, fileName);
      const sourceText = await readTextFile(sourcePath);
      const rawContent = JSON.parse(sourceText);
      const indexedSubject = lessonSubjectIndex[fileName]?.trim() || "";
      const filenameSubjectFallback = fallbackSubjectFromLessonFileName(fileName, subjects);
      const fallbackSubject = indexedSubject || filenameSubjectFallback;

      let lessonData: LessonData;

      if (rawContent.type === "doc" && !rawContent.version) {
        lessonData = {
          version: 1,
          metadata: {
            teacher: defaultTeacherName,
            createdAt: new Date().toISOString(),
            plannedFor: null,
            subject: fallbackSubject,
          },
          notes: "",
          content: rawContent,
        };
      } else {
        lessonData = rawContent as LessonData;
        if (typeof lessonData.notes !== "string") {
          lessonData = {
            ...lessonData,
            notes: "",
          };
        }
      }

      const rawMetadata = lessonData.metadata as Partial<LessonMetadata> | undefined;
      const normalizedMetadata: LessonMetadata = {
        teacher:
          typeof rawMetadata?.teacher === "string"
            ? rawMetadata.teacher
            : defaultTeacherName,
        createdAt:
          typeof rawMetadata?.createdAt === "string" && rawMetadata.createdAt.trim()
            ? rawMetadata.createdAt
            : new Date().toISOString(),
        plannedFor:
          typeof rawMetadata?.plannedFor === "string" && rawMetadata.plannedFor.trim()
            ? rawMetadata.plannedFor
            : null,
        subject:
          typeof rawMetadata?.subject === "string" && rawMetadata.subject.trim()
            ? rawMetadata.subject
            : fallbackSubject,
      };

      const nextLessonData: LessonData = {
        ...lessonData,
        metadata: {
          ...normalizedMetadata,
          plannedFor: createPlannedForIso(plannedDate),
        },
      };

      const nextFileName = buildLessonFileNameForMetadata(fileName, nextLessonData.metadata);
      let savePath = sourcePath;
      let finalFileName = fileName;

      if (nextFileName !== fileName) {
        const requestedPath = await join(lessonPlansFolder, nextFileName);
        let nextPath = requestedPath;

        if (await exists(requestedPath)) {
          nextPath = await ensureUniqueTargetPath(lessonPlansFolder, nextFileName);
        }

        await rename(sourcePath, nextPath);
        savePath = nextPath;
        finalFileName = extractBaseName(nextPath);
      }

      await writeTextFile(savePath, JSON.stringify(nextLessonData, null, 2));

      if (activeFilePath?.endsWith(fileName)) {
        set({
          activeFilePath: savePath,
          activeFileContent: nextLessonData,
        });
      }

      await get().refreshVault();
      return finalFileName;
    } catch (error) {
      console.error("Failed to reschedule lesson:", error);
      alert("Error rescheduling lesson: " + String(error));
      return null;
    }
  },

  deleteLesson: async (fileName: string) => {
    const { vaultPath, activeFilePath, currentView } = get();
    if (!vaultPath) return;

    try {
      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const filePath = await join(lessonPlansFolder, fileName);
      // Extract just the basename for trash naming (handles nested paths like "Folder/Lesson.json")
      const baseName = fileName.split("/").pop() || fileName;
      console.log("deleteLesson:", { fileName, baseName, filePath });
      const didMove = await movePathToTrash(vaultPath, filePath, "Lesson Plans", baseName);

      if (!didMove) {
        console.warn(`Skipped deleting lesson \"${fileName}\" because it no longer exists.`);
      }

      if (currentView === "editor" && activeFilePath?.endsWith(fileName)) {
        set({ activeFilePath: null, activeFileContent: null });
      }

      await get().refreshVault();
    } catch (error) {
      console.error("Failed to delete lesson:", error);
      alert("Error deleting lesson: " + String(error));
    }
  },

  renameLesson: async (oldFileName: string, newName: string) => {
    const { vaultPath, activeFilePath, currentView } = get();
    if (!vaultPath) return;

    try {
      const rawName = newName.trim();
      if (!rawName) return;
      if (rawName.includes("/") || rawName.includes("\\")) {
        alert("Name cannot contain path separators.");
        return;
      }

      const nextFileName = rawName.endsWith(".json") ? rawName : `${rawName}.json`;
      if (nextFileName === oldFileName) return;

      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const oldPath = await join(lessonPlansFolder, oldFileName);
      const newPath = await join(lessonPlansFolder, nextFileName);

      if (await exists(newPath)) {
        alert("A lesson plan with this name already exists.");
        return;
      }

      await rename(oldPath, newPath);

      if (currentView === "editor" && activeFilePath?.endsWith(oldFileName)) {
        set({ activeFilePath: newPath });
      }

      await get().refreshVault();
    } catch (error) {
      console.error("Failed to rename lesson:", error);
      alert("Error renaming lesson: " + String(error));
    }
  },

  saveActiveLesson: async (
    content: any,
    updatedMetadata?: Partial<LessonMetadata>,
    updatedNotes?: string,
    options?: SaveLessonOptions,
  ) => {
    const { activeFilePath, activeFileContent, vaultPath } = get();
    if (!activeFilePath || !activeFileContent || !vaultPath) return;
    const allowRename = options?.allowRename ?? true;

    try {
      const nextNotes =
        typeof updatedNotes === "string"
          ? updatedNotes
          : typeof activeFileContent.notes === "string"
            ? activeFileContent.notes
            : "";

      const newLessonData: LessonData = {
        ...activeFileContent,
        metadata: {
          ...activeFileContent.metadata,
          ...updatedMetadata
        },
        notes: nextNotes,
        content: content
      };

      let savePath = activeFilePath;
      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const currentFileName = activeFilePath.split(/[\/\\]/).pop() || "";

      // Preserve subfolder prefix (e.g. "History/") from the active file path
      const lpPrefix = lessonPlansFolder.endsWith("/") ? lessonPlansFolder : lessonPlansFolder + "/";
      const relativeActive = activeFilePath.startsWith(lpPrefix)
        ? activeFilePath.slice(lpPrefix.length)
        : currentFileName;
      const folderSlash = relativeActive.lastIndexOf("/");
      const folderPrefix = folderSlash >= 0 ? relativeActive.slice(0, folderSlash + 1) : "";

      const dateStr = newLessonData.metadata.plannedFor 
        ? newLessonData.metadata.plannedFor.split("T")[0] 
        : newLessonData.metadata.createdAt.split("T")[0];

      let newFileName = currentFileName;
      
      // Intelligent Naming Logic
      if (newLessonData.metadata.subject && newLessonData.metadata.subject.trim() !== "") {
        const sanitizedSubject = newLessonData.metadata.subject.trim().replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-');
        newFileName = `${folderPrefix}${dateStr}-${sanitizedSubject}.json`;
      } else {
        if (currentFileName.startsWith("Untitled-Lesson")) {
          const id = Date.now().toString().slice(-4);
          newFileName = `${folderPrefix}Lesson-${dateStr}-${id}.json`;
        }
      }

      if (allowRename && currentFileName !== newFileName) {
        const requestedPath = await join(lessonPlansFolder, newFileName);
        let newSavePath = requestedPath;

        if (requestedPath !== activeFilePath) {
          const requestedPathExists = await exists(requestedPath);
          if (requestedPathExists) {
            newSavePath = await ensureUniqueTargetPath(lessonPlansFolder, newFileName);
          }

          try {
            await rename(activeFilePath, newSavePath);
            savePath = newSavePath;
          } catch (renameError) {
            console.error("Rename failed, saving to old path", renameError);
          }
        }
      }

      await writeTextFile(savePath, JSON.stringify(newLessonData, null, 2));
      set({ activeFileContent: newLessonData, activeFilePath: savePath });
      await get().refreshVault(); 
    } catch (error) {
      console.error("Failed to save lesson:", error);
      alert("Error saving lesson: " + String(error));
    }
  },

  openLesson: async (fileName: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const parts = fileName.split("/").filter(Boolean);
      const filePath = await join(vaultPath, "Lesson Plans", ...parts);
      const text = await readTextFile(filePath);
      get().addRecent({ type: "lesson", relativePath: fileName });
      
      if (fileName.endsWith('.json')) {
        const rawContent = JSON.parse(text);
        let lessonData: LessonData;
        const { defaultTeacherName } = get();
        
        if (rawContent.type === "doc" && !rawContent.version) {
          lessonData = {
            version: 1,
            metadata: {
              teacher: defaultTeacherName,
              createdAt: new Date().toISOString(),
              plannedFor: null,
              subject: ""
            },
            notes: "",
            content: rawContent
          };
        } else {
          lessonData = rawContent as LessonData;
          if (typeof lessonData.notes !== "string") {
            lessonData = {
              ...lessonData,
              notes: "",
            };
          }
        }

        set({
          activeFilePath: filePath,
          activeFileContent: lessonData,
          currentView: "editor",
        });
      }
    } catch (error) {
      console.error("Failed to open lesson:", error);
    }
  },

  createNewMindmap: async (subFolder?: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const fileName = `Mindmap-${Date.now().toString().slice(-4)}.json`;
      const mindmapsFolder = subFolder
        ? await join(vaultPath, "Mindmaps", ...subFolder.split("/").filter(Boolean))
        : await join(vaultPath, "Mindmaps");
      if (!(await exists(mindmapsFolder))) {
        await mkdir(mindmapsFolder, { recursive: true });
      }
      const filePath = await join(mindmapsFolder, fileName);
      
      const initialContent: MindmapData = {
        version: 1,
        nodes: [
          {
            id: '1',
            data: { label: 'New Brainstorm' },
            position: { x: 250, y: 150 },
            style: { background: '#2d86a5', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 'bold' }
          }
        ],
        edges: []
      };
      
      await writeTextFile(filePath, JSON.stringify(initialContent, null, 2));
      set({ activeFilePath: filePath, activeMindmapContent: initialContent, currentView: "mindmap" });
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to create mindmap:", error);
      alert("Error creating mindmap: " + String(error));
    }
  },

  deleteMindmap: async (fileName: string) => {
    const { vaultPath, activeFilePath, currentView } = get();
    if (!vaultPath) return;

    try {
      const mindmapsFolder = await join(vaultPath, "Mindmaps");
      const filePath = await join(mindmapsFolder, fileName);
      // Extract just the basename for trash naming (handles nested paths like "Folder/Mindmap.json")
      const baseName = fileName.split("/").pop() || fileName;
      await movePathToTrash(vaultPath, filePath, "Mindmaps", baseName);

      if (currentView === "mindmap" && activeFilePath?.endsWith(fileName)) {
        set({ activeFilePath: null, activeMindmapContent: null });
      }

      await get().refreshVault();
    } catch (error) {
      console.error("Failed to delete mindmap:", error);
      alert("Error deleting mindmap: " + String(error));
    }
  },

  renameMindmap: async (oldFileName: string, newName: string) => {
    const { vaultPath, activeFilePath, currentView } = get();
    if (!vaultPath) return;

    try {
      const rawName = newName.trim();
      if (!rawName) return;
      if (rawName.includes("/") || rawName.includes("\\")) {
        alert("Name cannot contain path separators.");
        return;
      }

      const nextFileName = rawName.endsWith(".json") ? rawName : `${rawName}.json`;
      if (nextFileName === oldFileName) return;

      const mindmapsFolder = await join(vaultPath, "Mindmaps");
      const oldPath = await join(mindmapsFolder, oldFileName);
      const newPath = await join(mindmapsFolder, nextFileName);

      if (await exists(newPath)) {
        alert("A mindmap with this name already exists.");
        return;
      }

      await rename(oldPath, newPath);

      if (currentView === "mindmap" && activeFilePath?.endsWith(oldFileName)) {
        set({ activeFilePath: newPath });
      }

      await get().refreshVault();
    } catch (error) {
      console.error("Failed to rename mindmap:", error);
      alert("Error renaming mindmap: " + String(error));
    }
  },

  saveActiveMindmap: async (nodes: any[], edges: any[]) => {
    const { activeFilePath, vaultPath } = get();
    if (!activeFilePath || !vaultPath) return;

    try {
      const newMindmapData: MindmapData = {
        version: 1,
        nodes,
        edges
      };

      await writeTextFile(activeFilePath, JSON.stringify(newMindmapData, null, 2));
      set({ activeMindmapContent: newMindmapData });
    } catch (error) {
      console.error("Failed to save mindmap:", error);
      alert("Error saving mindmap: " + String(error));
    }
  },

  openMindmap: async (fileName: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const parts = fileName.split("/").filter(Boolean);
      const filePath = await join(vaultPath, "Mindmaps", ...parts);
      const text = await readTextFile(filePath);
      get().addRecent({ type: "mindmap", relativePath: fileName });
      
      if (fileName.endsWith('.json')) {
        const content = JSON.parse(text) as MindmapData;
        set({ activeFilePath: filePath, activeMindmapContent: content, currentView: "mindmap" });
      }
    } catch (error) {
      console.error("Failed to open mindmap:", error);
    }
  },

  addMaterialFiles: async (targetSubFolder) => {
    const { vaultPath } = get();
    if (!vaultPath) return [];

    try {
      const selected = await open({
        multiple: true,
        directory: false,
        title: "Select Material Files",
      });

      if (!selected) {
        return [];
      }

      const selectedFiles = Array.isArray(selected) ? selected : [selected];
      const subSegs = (targetSubFolder || "").split("/").filter(Boolean);
      const materialsFolder = subSegs.length > 0
        ? await join(vaultPath, "Materials", ...subSegs)
        : await join(vaultPath, "Materials");
      if (!(await exists(materialsFolder))) {
        await mkdir(materialsFolder, { recursive: true });
      }
      const importedRelativePaths: string[] = [];

      for (const sourceFile of selectedFiles) {
        const fileName = extractBaseName(sourceFile);
        const destinationPath = await ensureUniqueTargetPath(materialsFolder, fileName);
        await copyFile(sourceFile, destinationPath);
        importedRelativePaths.push(extractBaseName(destinationPath));
      }

      await get().refreshVault();
      return importedRelativePaths;
    } catch (error) {
      console.error("Failed to import material files:", error);
      alert("Error importing files: " + String(error));
      return [];
    }
  },

  addMaterialDirectory: async (targetSubFolder) => {
    const { vaultPath } = get();
    if (!vaultPath) return null;

    try {
      const selected = await open({
        multiple: false,
        directory: true,
        title: "Select Material Folder",
      });

      if (!selected || typeof selected !== "string") {
        return null;
      }

      const subSegs = (targetSubFolder || "").split("/").filter(Boolean);
      const materialsFolder = subSegs.length > 0
        ? await join(vaultPath, "Materials", ...subSegs)
        : await join(vaultPath, "Materials");
      if (!(await exists(materialsFolder))) {
        await mkdir(materialsFolder, { recursive: true });
      }
      const folderName = extractBaseName(selected);
      const destinationPath = await ensureUniqueTargetPath(materialsFolder, folderName);
      await copyDirectoryRecursive(selected, destinationPath);

      await get().refreshVault();
      return extractBaseName(destinationPath);
    } catch (error) {
      console.error("Failed to import material directory:", error);
      alert("Error importing folder: " + String(error));
      return null;
    }
  },

  deleteMaterialEntry: async (relativePath: string, isDirectory: boolean) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const pathSegments = relativePath.split("/").filter(Boolean);
      const targetPath = await join(vaultPath, "Materials", ...pathSegments);
      const entryName = pathSegments[pathSegments.length - 1] || "material";
      const trashEntryName = isDirectory ? `folder-${entryName}` : `file-${entryName}`;
      await movePathToTrash(vaultPath, targetPath, "Materials", trashEntryName);
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to delete material entry:", error);
      alert("Error deleting material entry: " + String(error));
    }
  },

  renameMaterialEntry: async (relativePath: string, newName: string) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const trimmed = newName.trim();
      if (!trimmed) return;
      if (trimmed.includes("/") || trimmed.includes("\\")) {
        alert("Name cannot contain path separators.");
        return;
      }

      const sourceSegments = relativePath.split("/").filter(Boolean);
      if (sourceSegments.length === 0) return;

      const sourceName = sourceSegments[sourceSegments.length - 1];
      if (sourceName === trimmed) return;

      const parentSegments = sourceSegments.slice(0, -1);
      const sourcePath = await join(vaultPath, "Materials", ...sourceSegments);
      const targetPath = await join(vaultPath, "Materials", ...parentSegments, trimmed);

      if (await exists(targetPath)) {
        alert("A material item with this name already exists in this folder.");
        return;
      }

      await rename(sourcePath, targetPath);
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to rename material entry:", error);
      alert("Error renaming material entry: " + String(error));
    }
  },

  restoreTrashEntry: async (relativePath: string, _isDirectory: boolean) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const pathSegments = relativePath.split("/").filter(Boolean);
      if (pathSegments.length < 2) {
        alert("Could not restore this trash entry.");
        return;
      }

      const section = pathSegments[0] as "Lesson Plans" | "Mindmaps" | "Materials";
      if (!["Lesson Plans", "Mindmaps", "Materials"].includes(section)) {
        alert("Unknown trash section.");
        return;
      }

      const trashSourcePath = await join(vaultPath, "Trash", ...pathSegments);
      const originalName = pathSegments[pathSegments.length - 1];
      const restoredName = stripTrashNamePrefix(originalName, section);
      const destinationRoot = await join(vaultPath, section);
      const destinationPath = await ensureUniqueTargetPath(destinationRoot, restoredName);

      await rename(trashSourcePath, destinationPath);
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to restore trash entry:", error);
      alert("Error restoring trash entry: " + String(error));
    }
  },

  permanentlyDeleteTrashEntry: async (relativePath: string, isDirectory: boolean) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const pathSegments = relativePath.split("/").filter(Boolean);
      const trashTargetPath = await join(vaultPath, "Trash", ...pathSegments);
      await remove(trashTargetPath, isDirectory ? { recursive: true } : undefined);
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to permanently delete trash entry:", error);
      alert("Error deleting trash entry: " + String(error));
    }
  },

  // ===== Generic vault path operations =====
  renameVaultPath: async (root, relativePath, newName) => {
    const { vaultPath, activeFilePath } = get();
    if (!vaultPath) return;
    try {
      const trimmed = newName.trim();
      if (!trimmed || trimmed.includes("/") || trimmed.includes("\\")) {
        alert("Name cannot be empty or contain path separators.");
        return;
      }
      const segs = relativePath.split("/").filter(Boolean);
      if (segs.length === 0) return;
      const isJson = segs[segs.length - 1].toLowerCase().endsWith(".json");
      const finalName = isJson && !trimmed.toLowerCase().endsWith(".json") ? `${trimmed}.json` : trimmed;
      const parentSegs = segs.slice(0, -1);
      const oldPath = await join(vaultPath, root, ...segs);
      const newPath = await join(vaultPath, root, ...parentSegs, finalName);
      if (oldPath === newPath) return;
      if (await exists(newPath)) {
        alert("An item with that name already exists here.");
        return;
      }
      await rename(oldPath, newPath);
      if (activeFilePath === oldPath) set({ activeFilePath: newPath });
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to rename vault path:", error);
      alert("Error renaming: " + String(error));
    }
  },

  moveVaultPath: async (root, sourceRelative, targetFolderRelative) => {
    const { vaultPath, activeFilePath } = get();
    if (!vaultPath) return;
    try {
      const srcSegs = sourceRelative.split("/").filter(Boolean);
      if (srcSegs.length === 0) return;
      const itemName = srcSegs[srcSegs.length - 1];
      const targetSegs = targetFolderRelative.split("/").filter(Boolean);
      const sourcePath = await join(vaultPath, root, ...srcSegs);
      const targetFolderPath = targetSegs.length === 0
        ? await join(vaultPath, root)
        : await join(vaultPath, root, ...targetSegs);

      // Prevent moving a folder into itself or its descendant
      const sourcePrefix = srcSegs.join("/");
      const targetJoined = targetSegs.join("/");
      if (targetJoined === sourcePrefix || targetJoined.startsWith(sourcePrefix + "/")) {
        alert("Cannot move a folder into itself.");
        return;
      }
      // No-op if already in target folder
      if (srcSegs.slice(0, -1).join("/") === targetJoined) return;

      if (!(await exists(targetFolderPath))) {
        await mkdir(targetFolderPath, { recursive: true });
      }
      const newPath = await ensureUniqueTargetPath(targetFolderPath, itemName);
      await rename(sourcePath, newPath);
      if (activeFilePath === sourcePath) set({ activeFilePath: newPath });
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to move vault path:", error);
      alert("Error moving: " + String(error));
    }
  },

  deleteVaultPath: async (root, relativePath, isDirectory) => {
    const { vaultPath, activeFilePath } = get();
    if (!vaultPath) return;
    try {
      const segs = relativePath.split("/").filter(Boolean);
      if (segs.length === 0) return;
      const sourcePath = await join(vaultPath, root, ...segs);
      const originalName = segs[segs.length - 1];
      const trashSection = root === "Materials" ? "Materials" : root;
      const moved = await movePathToTrash(vaultPath, sourcePath, trashSection, originalName);
      if (!moved) {
        // Fallback hard delete if not in vault anymore
        try { await remove(sourcePath, isDirectory ? { recursive: true } : undefined); } catch {}
      }
      if (activeFilePath === sourcePath) {
        set({ activeFilePath: null, activeFileContent: null, activeMindmapContent: null });
      }
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to delete vault path:", error);
      alert("Error deleting: " + String(error));
    }
  },

  duplicateVaultPath: async (root, relativePath) => {
    const { vaultPath } = get();
    if (!vaultPath) return;
    try {
      const segs = relativePath.split("/").filter(Boolean);
      if (segs.length === 0) return;
      const itemName = segs[segs.length - 1];
      const sourcePath = await join(vaultPath, root, ...segs);
      const parentPath = segs.length === 1
        ? await join(vaultPath, root)
        : await join(vaultPath, root, ...segs.slice(0, -1));

      // Build a "copy" name
      const dotIdx = itemName.lastIndexOf(".");
      const stem = dotIdx > 0 ? itemName.substring(0, dotIdx) : itemName;
      const ext = dotIdx > 0 ? itemName.substring(dotIdx) : "";
      const candidateName = `${stem} copy${ext}`;
      const destinationPath = await ensureUniqueTargetPath(parentPath, candidateName);

      const text = await readTextFile(sourcePath);
      await writeTextFile(destinationPath, text);
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to duplicate vault path:", error);
      alert("Error duplicating: " + String(error));
    }
  },

  // ===== Recents =====
  addRecent: (item) => {
    const next: RecentItem = { ...item, openedAt: Date.now() };
    const filtered = get().recents.filter(
      (r) => !(r.type === item.type && r.relativePath === item.relativePath),
    );
    const merged = [next, ...filtered].slice(0, 20);
    set({ recents: merged });
    try { localStorage.setItem("tp-recents", JSON.stringify(merged)); } catch {}
  },

  clearRecents: () => {
    set({ recents: [] });
    try { localStorage.removeItem("tp-recents"); } catch {}
  },
}));

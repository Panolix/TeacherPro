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

export interface LessonMetadata {
  teacher: string;
  createdAt: string;
  plannedFor: string | null;
  subject: string;
}

export interface LessonData {
  version: 1;
  metadata: LessonMetadata;
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
export type AccentColor = "blue" | "emerald" | "rose" | "amber";
export type SidebarSectionKey = "lessonPlans" | "mindmaps" | "materials";

interface UISettings {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  calendarCollapsed: boolean;
  sectionCollapsed: Record<SidebarSectionKey, boolean>;
  debugMode: boolean;
}

interface AppState {
  isInitialized: boolean;
  vaultPath: string | null;
  lessonPlans: DirEntry[];
  mindmaps: DirEntry[];
  materials: MaterialEntry[];
  themeMode: ThemeMode;
  accentColor: AccentColor;
  calendarCollapsed: boolean;
  sectionCollapsed: Record<SidebarSectionKey, boolean>;
  debugMode: boolean;
  debugEvents: DebugEventEntry[];
  draggedMaterial: DraggedMaterialRef | null;
  pendingMaterialDrop: PendingMaterialDropRef | null;
  sidebarOpen: boolean;
  currentView: "editor" | "calendar" | "mindmap";
  activeFilePath: string | null;
  activeFileContent: LessonData | null;
  activeMindmapContent: MindmapData | null;
  
  initVault: () => Promise<void>;
  setSidebarOpen: (isOpen: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setCalendarCollapsed: (collapsed: boolean) => void;
  toggleSectionCollapsed: (section: SidebarSectionKey) => void;
  setDebugMode: (enabled: boolean) => void;
  logDebug: (source: string, action: string, detail?: string) => void;
  clearDebugEvents: () => void;
  setDraggedMaterial: (material: DraggedMaterialRef | null) => void;
  setPendingMaterialDrop: (drop: PendingMaterialDropRef | null) => void;
  setCurrentView: (view: "editor" | "calendar" | "mindmap") => void;
  openVault: () => Promise<void>;
  refreshVault: () => Promise<void>;
  createNewLesson: (plannedDate?: Date) => Promise<void>;
  deleteLesson: (fileName: string) => Promise<void>;
  renameLesson: (oldFileName: string, newName: string) => Promise<void>;
  saveActiveLesson: (content: any, metadata?: Partial<LessonMetadata>) => Promise<void>;
  openLesson: (fileName: string) => Promise<void>;
  createNewMindmap: () => Promise<void>;
  deleteMindmap: (fileName: string) => Promise<void>;
  renameMindmap: (oldFileName: string, newName: string) => Promise<void>;
  saveActiveMindmap: (nodes: any[], edges: any[]) => Promise<void>;
  openMindmap: (fileName: string) => Promise<void>;
  addMaterialFiles: () => Promise<string[]>;
  addMaterialDirectory: () => Promise<string | null>;
  deleteMaterialEntry: (relativePath: string, isDirectory: boolean) => Promise<void>;
  renameMaterialEntry: (relativePath: string, newName: string) => Promise<void>;
}

const STORE_KEY = "teacherpro-settings.json";

const DEFAULT_UI_SETTINGS: UISettings = {
  themeMode: "dark",
  accentColor: "blue",
  calendarCollapsed: false,
  sectionCollapsed: {
    lessonPlans: false,
    mindmaps: false,
    materials: false,
  },
  debugMode: false,
};

async function persistUiSettings(patch: Partial<UISettings>): Promise<void> {
  const store = await load(STORE_KEY, { autoSave: true, defaults: {} });
  const current = (await store.get<Partial<UISettings>>("uiSettings")) || {};
  const next: UISettings = {
    ...DEFAULT_UI_SETTINGS,
    ...current,
    ...patch,
    sectionCollapsed: {
      ...DEFAULT_UI_SETTINGS.sectionCollapsed,
      ...((current as Partial<UISettings>).sectionCollapsed || {}),
      ...(patch.sectionCollapsed || {}),
    },
  };

  await store.set("uiSettings", next);
  await store.save();
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

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  vaultPath: null,
  lessonPlans: [],
  mindmaps: [],
  materials: [],
  themeMode: DEFAULT_UI_SETTINGS.themeMode,
  accentColor: DEFAULT_UI_SETTINGS.accentColor,
  calendarCollapsed: DEFAULT_UI_SETTINGS.calendarCollapsed,
  sectionCollapsed: DEFAULT_UI_SETTINGS.sectionCollapsed,
  debugMode: DEFAULT_UI_SETTINGS.debugMode,
  debugEvents: [],
  draggedMaterial: null,
  pendingMaterialDrop: null,
  sidebarOpen: true,
  currentView: "editor",
  activeFilePath: null,
  activeFileContent: null,
  activeMindmapContent: null,

  initVault: async () => {
    try {
      const store = await load(STORE_KEY, { autoSave: true, defaults: {} });
      const savedVault = await store.get<{ path: string }>("vault");
      const savedSettings = await store.get<Partial<UISettings>>("uiSettings");

      if (savedSettings) {
        set({
          themeMode: savedSettings.themeMode || DEFAULT_UI_SETTINGS.themeMode,
          accentColor: savedSettings.accentColor || DEFAULT_UI_SETTINGS.accentColor,
          calendarCollapsed: savedSettings.calendarCollapsed ?? DEFAULT_UI_SETTINGS.calendarCollapsed,
          sectionCollapsed: {
            ...DEFAULT_UI_SETTINGS.sectionCollapsed,
            ...(savedSettings.sectionCollapsed || {}),
          },
          debugMode: savedSettings.debugMode ?? DEFAULT_UI_SETTINGS.debugMode,
        });
      }
      
      if (savedVault && savedVault.path) {
        set({ vaultPath: savedVault.path });
        await get().refreshVault();
      }
    } catch (e) {
      console.warn("Failed to load vault from store", e);
    } finally {
      set({ isInitialized: true });
    }
  },

  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setThemeMode: (mode) => {
    set({ themeMode: mode });
    void persistUiSettings({ themeMode: mode });
  },
  setAccentColor: (color) => {
    set({ accentColor: color });
    void persistUiSettings({ accentColor: color });
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
          await store.save();
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

    const folders = ["Lesson Plans", "Mindmaps", "Materials", "Exports"];
    
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
      
      set({ 
        lessonPlans: lpFiltered,
        mindmaps: mmFiltered,
        materials: materialTree 
      });
    } catch (error) {
      console.error("Failed to refresh vault contents:", error);
    }
  },

  createNewLesson: async (plannedDate?: Date) => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const dateStr = plannedDate ? plannedDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      const fileName = `Lesson-${dateStr}-${Date.now().toString().slice(-4)}.json`;
      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const filePath = await join(lessonPlansFolder, fileName);
      
      const initialContent: LessonData = {
        version: 1,
        metadata: {
          teacher: "Panagiotis Smponias",
          createdAt: new Date().toISOString(),
          plannedFor: plannedDate ? plannedDate.toISOString() : null,
          subject: ""
        },
        content: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "New Lesson Plan" }] }
          ]
        }
      };
      
      await writeTextFile(filePath, JSON.stringify(initialContent, null, 2));
      set({ activeFilePath: filePath, activeFileContent: initialContent, currentView: "editor" });
      await get().refreshVault();
    } catch (error) {
      console.error("Failed to create new lesson:", error);
      alert("Error creating lesson: " + String(error));
    }
  },

  deleteLesson: async (fileName: string) => {
    const { vaultPath, activeFilePath, currentView } = get();
    if (!vaultPath) return;

    try {
      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const filePath = await join(lessonPlansFolder, fileName);
      await remove(filePath);

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

  saveActiveLesson: async (content: any, updatedMetadata?: Partial<LessonMetadata>) => {
    const { activeFilePath, activeFileContent, vaultPath } = get();
    if (!activeFilePath || !activeFileContent || !vaultPath) return;

    try {
      const newLessonData: LessonData = {
        ...activeFileContent,
        metadata: {
          ...activeFileContent.metadata,
          ...updatedMetadata
        },
        content: content
      };

      let savePath = activeFilePath;
      const currentFileName = activeFilePath.split(/[\/\\]/).pop() || "";
      const dateStr = newLessonData.metadata.plannedFor 
        ? newLessonData.metadata.plannedFor.split("T")[0] 
        : newLessonData.metadata.createdAt.split("T")[0];

      let newFileName = currentFileName;
      
      // Intelligent Naming Logic
      if (newLessonData.metadata.subject && newLessonData.metadata.subject.trim() !== "") {
        const sanitizedSubject = newLessonData.metadata.subject.trim().replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-');
        newFileName = `${dateStr}-${sanitizedSubject}.json`;
      } else {
        if (currentFileName.startsWith("Untitled-Lesson")) {
          const id = Date.now().toString().slice(-4);
          newFileName = `Lesson-${dateStr}-${id}.json`;
        }
      }

      if (currentFileName !== newFileName) {
         const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
         const newSavePath = await join(lessonPlansFolder, newFileName);
         try {
           await rename(activeFilePath, newSavePath);
           savePath = newSavePath;
         } catch (renameError) {
           console.error("Rename failed, saving to old path", renameError);
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
      const lessonPlansFolder = await join(vaultPath, "Lesson Plans");
      const filePath = await join(lessonPlansFolder, fileName);
      const text = await readTextFile(filePath);
      
      if (fileName.endsWith('.json')) {
        const rawContent = JSON.parse(text);
        let lessonData: LessonData;
        
        if (rawContent.type === "doc" && !rawContent.version) {
          lessonData = {
            version: 1,
            metadata: {
              teacher: "Panagiotis Smponias",
              createdAt: new Date().toISOString(),
              plannedFor: null,
              subject: ""
            },
            content: rawContent
          };
        } else {
          lessonData = rawContent as LessonData;
        }

        set({ activeFilePath: filePath, activeFileContent: lessonData, currentView: "editor" });
      }
    } catch (error) {
      console.error("Failed to open lesson:", error);
    }
  },

  createNewMindmap: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const fileName = `Mindmap-${Date.now().toString().slice(-4)}.json`;
      const mindmapsFolder = await join(vaultPath, "Mindmaps");
      const filePath = await join(mindmapsFolder, fileName);
      
      const initialContent: MindmapData = {
        version: 1,
        nodes: [
          {
            id: '1',
            data: { label: 'New Brainstorm' },
            position: { x: 250, y: 150 },
            style: { background: '#9fd2e4', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 'bold' }
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
      await remove(filePath);

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
      const mindmapsFolder = await join(vaultPath, "Mindmaps");
      const filePath = await join(mindmapsFolder, fileName);
      const text = await readTextFile(filePath);
      
      if (fileName.endsWith('.json')) {
        const content = JSON.parse(text) as MindmapData;
        set({ activeFilePath: filePath, activeMindmapContent: content, currentView: "mindmap" });
      }
    } catch (error) {
      console.error("Failed to open mindmap:", error);
    }
  },

  addMaterialFiles: async () => {
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
      const materialsFolder = await join(vaultPath, "Materials");
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

  addMaterialDirectory: async () => {
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

      const materialsFolder = await join(vaultPath, "Materials");
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
      await remove(targetPath, isDirectory ? { recursive: true } : undefined);
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
  }
}));

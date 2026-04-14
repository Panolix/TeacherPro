import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, DirEntry, writeTextFile, readTextFile, rename, mkdir, exists } from "@tauri-apps/plugin-fs";
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

interface AppState {
  isInitialized: boolean;
  vaultPath: string | null;
  lessonPlans: DirEntry[];
  mindmaps: DirEntry[];
  materials: DirEntry[];
  sidebarOpen: boolean;
  currentView: "editor" | "calendar" | "mindmap";
  activeFilePath: string | null;
  activeFileContent: LessonData | null;
  activeMindmapContent: MindmapData | null;
  
  initVault: () => Promise<void>;
  setSidebarOpen: (isOpen: boolean) => void;
  setCurrentView: (view: "editor" | "calendar" | "mindmap") => void;
  openVault: () => Promise<void>;
  refreshVault: () => Promise<void>;
  createNewLesson: (plannedDate?: Date) => Promise<void>;
  saveActiveLesson: (content: any, metadata?: Partial<LessonMetadata>) => Promise<void>;
  openLesson: (fileName: string) => Promise<void>;
  createNewMindmap: () => Promise<void>;
  saveActiveMindmap: (nodes: any[], edges: any[]) => Promise<void>;
  openMindmap: (fileName: string) => Promise<void>;
}

const STORE_KEY = "teacherpro-settings.json";

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  vaultPath: null,
  lessonPlans: [],
  mindmaps: [],
  materials: [],
  sidebarOpen: true,
  currentView: "editor",
  activeFilePath: null,
  activeFileContent: null,
  activeMindmapContent: null,

  initVault: async () => {
    try {
      const store = await load(STORE_KEY, { autoSave: true, defaults: {} });
      const savedVault = await store.get<{ path: string }>("vault");
      
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
      const lpFiltered = lpEntries.filter(e => !e.name?.startsWith(".")).sort((a,b) => (a.name||"").localeCompare(b.name||""));

      const mindmapsPath = await join(vaultPath, "Mindmaps");
      const mmEntries = await readDir(mindmapsPath);
      const mmFiltered = mmEntries.filter(e => !e.name?.startsWith(".")).sort((a,b) => (a.name||"").localeCompare(b.name||""));

      const materialsPath = await join(vaultPath, "Materials");
      const matEntries = await readDir(materialsPath);
      const matFiltered = matEntries.filter(e => !e.name?.startsWith(".")).sort((a,b) => (a.name||"").localeCompare(b.name||""));
      
      set({ 
        lessonPlans: lpFiltered,
        mindmaps: mmFiltered,
        materials: matFiltered 
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
            style: { background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 'bold' }
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
  }
}));

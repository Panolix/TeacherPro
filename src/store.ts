import { create } from "zustand";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, DirEntry } from "@tauri-apps/plugin-fs";

interface AppState {
  vaultPath: string | null;
  vaultContents: DirEntry[];
  sidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  openVault: () => Promise<void>;
  refreshVault: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  vaultPath: null,
  vaultContents: [],
  sidebarOpen: true,
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),

  openVault: async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select TeacherPro Vault",
      });

      if (selected && typeof selected === "string") {
        set({ vaultPath: selected });
        await get().refreshVault();
      }
    } catch (error) {
      console.error("Failed to open vault:", error);
    }
  },

  refreshVault: async () => {
    const { vaultPath } = get();
    if (!vaultPath) return;

    try {
      const entries = await readDir(vaultPath);
      // Filter out hidden files or specific non-material files if needed
      const filtered = entries.filter((e) => !e.name?.startsWith("."));
      set({ vaultContents: filtered });
    } catch (error) {
      console.error("Failed to read vault contents:", error);
    }
  },
}));

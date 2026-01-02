import { create } from "zustand";
import { DEFAULT_SETTINGS, type AppSettings } from "../lib/settings";
import { getSettings, saveSettings } from "../lib/storage/settings";

interface SettingsStore {
  settings: AppSettings;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    const stored = await getSettings();
    set({ settings: stored, isLoaded: true });
  },

  updateSettings: async (updates) => {
    const next = { ...get().settings, ...updates };
    set({ settings: next });
    await saveSettings(next);
  },
}));

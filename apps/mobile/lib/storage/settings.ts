import * as SecureStore from "expo-secure-store";
import { DEFAULT_SETTINGS, type AppSettings } from "../settings";

const SETTINGS_KEY = "cosmq_settings";

export async function getSettings(): Promise<AppSettings> {
  const data = await SecureStore.getItemAsync(SETTINGS_KEY);
  if (!data) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(data) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
}

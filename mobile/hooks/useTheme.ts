import { useMemo } from "react";
import { getTheme } from "../lib/theme";
import { useSettingsStore } from "../stores/settings";

export const useTheme = () => {
  const darkMode = useSettingsStore((state) => state.settings.darkMode);
  return useMemo(() => getTheme(darkMode), [darkMode]);
};

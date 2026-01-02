export type Theme = {
  mode: "dark" | "light";
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    surfaceMuted: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    border: string;
    primary: string;
    primaryMuted: string;
    success: string;
    successMuted: string;
    warning: string;
    warningMuted: string;
    danger: string;
    dangerMuted: string;
    accent: string;
    accentMuted: string;
    placeholder: string;
    disabled: string;
  };
};

const dark: Theme = {
  mode: "dark",
  colors: {
    background: "#16213e",
    surface: "#1a1a2e",
    surfaceAlt: "#252545",
    surfaceMuted: "#333",
    text: "#fff",
    textMuted: "#ccc",
    textSubtle: "#888",
    border: "#ffffff10",
    primary: "#4f46e5",
    primaryMuted: "#4f46e520",
    success: "#22c55e",
    successMuted: "#22c55e20",
    warning: "#f59e0b",
    warningMuted: "#f59e0b20",
    danger: "#ef4444",
    dangerMuted: "#dc262620",
    accent: "#c678dd",
    accentMuted: "#c678dd40",
    placeholder: "#666",
    disabled: "#6b7280",
  },
};

const light: Theme = {
  mode: "light",
  colors: {
    background: "#f8fafc",
    surface: "#ffffff",
    surfaceAlt: "#f1f5f9",
    surfaceMuted: "#e2e8f0",
    text: "#0f172a",
    textMuted: "#334155",
    textSubtle: "#64748b",
    border: "#e2e8f0",
    primary: "#4f46e5",
    primaryMuted: "#4f46e510",
    success: "#16a34a",
    successMuted: "#16a34a1a",
    warning: "#d97706",
    warningMuted: "#d9770612",
    danger: "#dc2626",
    dangerMuted: "#dc262612",
    accent: "#7c3aed",
    accentMuted: "#7c3aed1a",
    placeholder: "#94a3b8",
    disabled: "#94a3b8",
  },
};

export const getTheme = (darkMode: boolean): Theme =>
  darkMode ? dark : light;

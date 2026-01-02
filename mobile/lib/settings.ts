export type AppSettings = {
  darkMode: boolean;
  dangerousOpsHint: boolean;
  enableAutocomplete: boolean;
  showSqlTemplates: boolean;
  showQuickActions: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: true,
  dangerousOpsHint: true,
  enableAutocomplete: true,
  showSqlTemplates: true,
  showQuickActions: true,
};

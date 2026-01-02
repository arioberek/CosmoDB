export type AppLockTimeout = "immediate" | "15s" | "1m" | "5m";

export type AppSettings = {
  darkMode: boolean;
  dangerousOpsHint: boolean;
  enableAutocomplete: boolean;
  showSqlTemplates: boolean;
  showQuickActions: boolean;
  autoRollbackEnabled: boolean;
  autoRollbackSeconds: number;
  appLockEnabled: boolean;
  appLockTimeout: AppLockTimeout;
};

export const AUTO_ROLLBACK_RANGE = {
  min: 5,
  max: 300,
};

export const DEFAULT_AUTO_ROLLBACK_SECONDS = 20;

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: true,
  dangerousOpsHint: true,
  enableAutocomplete: true,
  showSqlTemplates: true,
  showQuickActions: true,
  autoRollbackEnabled: true,
  autoRollbackSeconds: DEFAULT_AUTO_ROLLBACK_SECONDS,
  appLockEnabled: false,
  appLockTimeout: "immediate",
};

export const normalizeAutoRollbackSeconds = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_AUTO_ROLLBACK_SECONDS;
  }
  const rounded = Math.round(value);
  return Math.min(
    AUTO_ROLLBACK_RANGE.max,
    Math.max(AUTO_ROLLBACK_RANGE.min, rounded)
  );
};

export const APP_LOCK_TIMEOUT_MS: Record<AppLockTimeout, number> = {
  immediate: 0,
  "15s": 15_000,
  "1m": 60_000,
  "5m": 300_000,
};

export const APP_LOCK_TIMEOUT_LABELS: Record<AppLockTimeout, string> = {
  immediate: "Immediately",
  "15s": "After 15 seconds",
  "1m": "After 1 minute",
  "5m": "After 5 minutes",
};

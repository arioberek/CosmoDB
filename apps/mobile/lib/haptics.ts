import * as Haptics from "expo-haptics";
import { useSettingsStore } from "../stores/settings";

type HapticType = "success" | "warning" | "error" | "light" | "medium" | "heavy";

export const triggerHaptic = async (
  type: HapticType,
  enabled: boolean
): Promise<void> => {
  if (!enabled) return;

  switch (type) {
    case "success":
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case "warning":
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      break;
    case "error":
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
    case "light":
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case "medium":
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case "heavy":
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
  }
};

export const useHaptic = () => {
  const enabled = useSettingsStore(
    (state) => state.settings.hapticFeedbackEnabled
  );

  return {
    success: () => triggerHaptic("success", enabled),
    warning: () => triggerHaptic("warning", enabled),
    error: () => triggerHaptic("error", enabled),
    light: () => triggerHaptic("light", enabled),
    medium: () => triggerHaptic("medium", enabled),
    heavy: () => triggerHaptic("heavy", enabled),
  };
};

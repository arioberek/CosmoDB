import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../lib/theme";
import { useSettingsStore } from "../stores/settings";
import {
  checkBiometricCapability,
  getBiometricDisplayName,
  authenticate,
  type BiometricCapability,
} from "../lib/app-lock";
import {
  APP_LOCK_TIMEOUT_LABELS,
  AUTO_ROLLBACK_RANGE,
  type AppLockTimeout,
  normalizeAutoRollbackSeconds,
} from "../lib/settings";

const Section = ({
  title,
  children,
  styles,
}: {
  title: string;
  children: ReactNode;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

const SettingRow = ({
  label,
  description,
  value,
  onValueChange,
  styles,
  theme,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) => (
  <View style={styles.settingRow}>
    <View style={styles.settingText}>
      <Text style={styles.settingLabel}>{label}</Text>
      {description ? (
        <Text style={styles.settingDescription}>{description}</Text>
      ) : null}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{
        false: theme.colors.surfaceMuted,
        true: theme.colors.primary,
      }}
      thumbColor="#fff"
    />
  </View>
);

const NumberSettingRow = ({
  label,
  description,
  value,
  onChangeText,
  onFocus,
  onBlur,
  editable,
  styles,
  theme,
}: {
  label: string;
  description?: string;
  value: string;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  editable: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) => (
  <View style={styles.settingRow}>
    <View style={styles.settingText}>
      <Text style={styles.settingLabel}>{label}</Text>
      {description ? (
        <Text style={styles.settingDescription}>{description}</Text>
      ) : null}
    </View>
    <View
      style={[
        styles.numberInputContainer,
        !editable && styles.numberInputContainerDisabled,
      ]}
    >
      <TextInput
        style={[styles.numberInput, !editable && styles.numberInputDisabled]}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={`${AUTO_ROLLBACK_RANGE.min}-${AUTO_ROLLBACK_RANGE.max}`}
        placeholderTextColor={theme.colors.placeholder}
        keyboardType="number-pad"
        returnKeyType="done"
        editable={editable}
      />
      <Text
        style={[
          styles.numberInputSuffix,
          !editable && styles.numberInputSuffixDisabled,
        ]}
      >
        s
      </Text>
    </View>
  </View>
);

const InfoRow = ({
  label,
  value,
  styles,
  onPress,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
}) =>
  onPress ? (
    <Pressable
      style={({ pressed }) => [
        styles.infoRow,
        pressed && styles.infoRowPressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </Pressable>
  ) : (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

const TIMEOUT_OPTIONS: AppLockTimeout[] = ["immediate", "15s", "1m", "5m"];

const TimeoutSelector = ({
  value,
  onChange,
  styles,
}: {
  value: AppLockTimeout;
  onChange: (value: AppLockTimeout) => void;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.timeoutContainer}>
    <Text style={styles.timeoutLabel}>Lock after leaving app:</Text>
    <View style={styles.timeoutOptions}>
      {TIMEOUT_OPTIONS.map((option) => (
        <Pressable
          key={option}
          style={[
            styles.timeoutOption,
            value === option && styles.timeoutOptionActive,
          ]}
          onPress={() => onChange(option)}
        >
          <Text
            style={[
              styles.timeoutOptionText,
              value === option && styles.timeoutOptionTextActive,
            ]}
          >
            {APP_LOCK_TIMEOUT_LABELS[option]}
          </Text>
        </Pressable>
      ))}
    </View>
  </View>
);

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { settings, updateSettings } = useSettingsStore();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const [biometricCapability, setBiometricCapability] = useState<BiometricCapability | null>(null);
  const versionTapCount = useRef(0);
  const versionTapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoRollbackInput, setAutoRollbackInput] = useState(
    settings.autoRollbackSeconds.toString()
  );
  const [isAutoRollbackEditing, setIsAutoRollbackEditing] = useState(false);

  useEffect(() => {
    checkBiometricCapability().then(setBiometricCapability);
  }, []);

  useEffect(() => {
    if (!isAutoRollbackEditing) {
      setAutoRollbackInput(settings.autoRollbackSeconds.toString());
    }
  }, [settings.autoRollbackSeconds, isAutoRollbackEditing]);

  useEffect(() => {
    return () => {
      if (versionTapTimeout.current) {
        clearTimeout(versionTapTimeout.current);
      }
    };
  }, []);

  const biometricName = biometricCapability
    ? getBiometricDisplayName(biometricCapability.availableTypes)
    : "Biometrics";

  const canEnableAppLock = biometricCapability?.isSupported && biometricCapability?.isEnrolled;

  const handleAppLockToggle = useCallback(async (enable: boolean) => {
    if (!enable) {
      await updateSettings({ appLockEnabled: false });
      return;
    }

    if (!canEnableAppLock) {
      Alert.alert(
        "Cannot Enable App Lock",
        biometricCapability?.isSupported
          ? "No biometric credentials are enrolled. Please set up Face ID, Touch ID, or fingerprint in your device settings first."
          : "Biometric authentication is not supported on this device."
      );
      return;
    }

    const result = await authenticate("Authenticate to enable App Lock");
    if (result.success) {
      await updateSettings({ appLockEnabled: true });
    } else if (result.error) {
      Alert.alert("Authentication Failed", result.error);
    }
  }, [canEnableAppLock, biometricCapability, updateSettings]);

  const handleAutoRollbackToggle = useCallback(
    async (enable: boolean) => {
      if (!enable) {
        await updateSettings({ autoRollbackEnabled: false });
        return;
      }

      const parsed = Number.parseInt(autoRollbackInput, 10);
      const normalized = normalizeAutoRollbackSeconds(
        Number.isNaN(parsed) ? settings.autoRollbackSeconds : parsed
      );
      setAutoRollbackInput(normalized.toString());
      await updateSettings({
        autoRollbackEnabled: true,
        autoRollbackSeconds: normalized,
      });
    },
    [autoRollbackInput, settings.autoRollbackSeconds, updateSettings]
  );

  const commitAutoRollbackSeconds = useCallback(async () => {
    const parsed = Number.parseInt(autoRollbackInput, 10);
    if (Number.isNaN(parsed)) {
      setAutoRollbackInput(settings.autoRollbackSeconds.toString());
      return;
    }

    const normalized = normalizeAutoRollbackSeconds(parsed);
    setAutoRollbackInput(normalized.toString());
    await updateSettings({ autoRollbackSeconds: normalized });
  }, [autoRollbackInput, settings.autoRollbackSeconds, updateSettings]);

  const handleVersionTap = useCallback(() => {
    if (versionTapTimeout.current) {
      clearTimeout(versionTapTimeout.current);
    }

    versionTapCount.current += 1;
    if (versionTapCount.current >= 5) {
      versionTapCount.current = 0;
      Alert.alert(
        "You found the Cosmos",
        "Thanks for exploring. Keep building."
      );
      return;
    }

    versionTapTimeout.current = setTimeout(() => {
      versionTapCount.current = 0;
    }, 1200);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Appearance" styles={styles}>
        <SettingRow
          label="Dark Mode"
          description="Switch between light and dark themes."
          value={settings.darkMode}
          onValueChange={(value) => updateSettings({ darkMode: value })}
          styles={styles}
          theme={theme}
        />
      </Section>

      <Section title="Security" styles={styles}>
        <SettingRow
          label={`App Lock (${biometricName})`}
          description={
            canEnableAppLock
              ? "Require biometric authentication to access the app."
              : biometricCapability?.isSupported
                ? "Set up Face ID or fingerprint in device settings to enable."
                : "Not supported on this device."
          }
          value={settings.appLockEnabled}
          onValueChange={handleAppLockToggle}
          styles={styles}
          theme={theme}
        />
        {settings.appLockEnabled ? (
          <>
            <View style={styles.divider} />
            <TimeoutSelector
              value={settings.appLockTimeout}
              onChange={(value) => updateSettings({ appLockTimeout: value })}
              styles={styles}
            />
          </>
        ) : null}
      </Section>

      <Section title="Safety" styles={styles}>
        <SettingRow
          label="Dangerous Operations Hint"
          description="Confirm UPDATE/DELETE/DROP statements and suggest transactions for rollback."
          value={settings.dangerousOpsHint}
          onValueChange={(value) => updateSettings({ dangerousOpsHint: value })}
          styles={styles}
          theme={theme}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Auto-rollback Transactions"
          description="Automatically rollback unfinished transactions after a timeout."
          value={settings.autoRollbackEnabled}
          onValueChange={handleAutoRollbackToggle}
          styles={styles}
          theme={theme}
        />
        <View style={styles.divider} />
        <NumberSettingRow
          label="Auto-rollback Timer"
          description={`Timeout before rollback (${AUTO_ROLLBACK_RANGE.min}-${AUTO_ROLLBACK_RANGE.max}s).`}
          value={autoRollbackInput}
          onChangeText={setAutoRollbackInput}
          onFocus={() => setIsAutoRollbackEditing(true)}
          onBlur={() => {
            setIsAutoRollbackEditing(false);
            commitAutoRollbackSeconds();
          }}
          editable={settings.autoRollbackEnabled}
          styles={styles}
          theme={theme}
        />
      </Section>

      <Section title="Editor" styles={styles}>
        <SettingRow
          label="Autocomplete Suggestions"
          description="Show SQL keyword autocomplete as you type."
          value={settings.enableAutocomplete}
          onValueChange={(value) => updateSettings({ enableAutocomplete: value })}
          styles={styles}
          theme={theme}
        />
        <View style={styles.divider} />
        <SettingRow
          label="SQL Templates"
          description="Show quick templates for common queries."
          value={settings.showSqlTemplates}
          onValueChange={(value) => updateSettings({ showSqlTemplates: value })}
          styles={styles}
          theme={theme}
        />
        <View style={styles.divider} />
        <SettingRow
          label="Quick Actions"
          description="Show one-tap SQL snippets under the editor."
          value={settings.showQuickActions}
          onValueChange={(value) => updateSettings({ showQuickActions: value })}
          styles={styles}
          theme={theme}
        />
      </Section>

      <Section title="About" styles={styles}>
        <InfoRow
          label="Version"
          value={appVersion}
          styles={styles}
          onPress={handleVersionTap}
        />
      </Section>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: 16,
      gap: 20,
    },
    section: {
      gap: 10,
    },
    sectionTitle: {
      color: theme.colors.textSubtle,
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    sectionCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    settingText: {
      flex: 1,
      gap: 4,
    },
    settingLabel: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: "600",
    },
    settingDescription: {
      color: theme.colors.textSubtle,
      fontSize: 12,
      lineHeight: 16,
    },
    numberInputContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minWidth: 96,
      justifyContent: "flex-end",
    },
    numberInputContainerDisabled: {
      opacity: 0.6,
    },
    numberInput: {
      color: theme.colors.text,
      fontSize: 14,
      minWidth: 36,
      textAlign: "right",
      paddingVertical: 2,
    },
    numberInputDisabled: {
      color: theme.colors.textSubtle,
    },
    numberInputSuffix: {
      color: theme.colors.textSubtle,
      fontSize: 12,
      fontWeight: "600",
    },
    numberInputSuffixDisabled: {
      color: theme.colors.textSubtle,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    infoRowPressed: {
      opacity: 0.7,
    },
    infoLabel: {
      color: theme.colors.textSubtle,
      fontSize: 14,
    },
    infoValue: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: "500",
    },
    timeoutContainer: {
      gap: 8,
    },
    timeoutLabel: {
      color: theme.colors.textSubtle,
      fontSize: 12,
    },
    timeoutOptions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    timeoutOption: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: "transparent",
    },
    timeoutOptionActive: {
      backgroundColor: theme.colors.primaryMuted,
      borderColor: theme.colors.primary,
    },
    timeoutOptionText: {
      color: theme.colors.textSubtle,
      fontSize: 12,
      fontWeight: "500",
    },
    timeoutOptionTextActive: {
      color: theme.colors.text,
    },
  });

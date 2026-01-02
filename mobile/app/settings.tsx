import Constants from "expo-constants";
import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../lib/theme";
import { useSettingsStore } from "../stores/settings";

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

const InfoRow = ({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { settings, updateSettings } = useSettingsStore();
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

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

      <Section title="Safety" styles={styles}>
        <SettingRow
          label="Dangerous Operations Hint"
          description="Confirm UPDATE/DELETE/DROP statements and suggest transactions for rollback."
          value={settings.dangerousOpsHint}
          onValueChange={(value) => updateSettings({ dangerousOpsHint: value })}
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
        <InfoRow label="Version" value={appVersion} styles={styles} />
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
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
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
  });

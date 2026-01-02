import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../lib/theme";
import {
  authenticate,
  checkBiometricCapability,
  getBiometricDisplayName,
  type BiometricCapability,
} from "../lib/app-lock";

type LockScreenProps = {
  onUnlock: () => void;
};

export const LockScreen = ({ onUnlock }: LockScreenProps) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const hasTriedAutoAuth = useRef(false);
  const onUnlockRef = useRef(onUnlock);
  
  onUnlockRef.current = onUnlock;

  useEffect(() => {
    checkBiometricCapability().then(setCapability);
  }, []);

  const handleUnlock = useCallback(async () => {
    if (isAuthenticating) return;
    
    setError(null);
    setWarning(null);
    setIsAuthenticating(true);

    try {
      const result = await authenticate();

      if (result.success) {
        onUnlockRef.current();
        return;
      }

      if (result.error) {
        setError(result.error);
      } else if (result.warning) {
        setWarning(result.warning);
      }
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating]);

  useEffect(() => {
    if (capability?.isEnrolled && !hasTriedAutoAuth.current) {
      hasTriedAutoAuth.current = true;
      handleUnlock();
    }
  }, [capability?.isEnrolled, handleUnlock]);

  const biometricName = capability
    ? getBiometricDisplayName(capability.availableTypes)
    : "Biometrics";

  const canAuthenticate = capability?.isSupported && capability?.isEnrolled;

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Text style={styles.lockIcon}>🔐</Text>
        </View>

        <Text style={styles.title}>COSMQ</Text>
        <Text style={styles.subtitle}>App Locked</Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {warning ? (
          <View style={styles.warningContainer}>
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        ) : null}

        {!capability ? (
          <ActivityIndicator
            size="large"
            color={theme.colors.primary}
            style={styles.loader}
          />
        ) : canAuthenticate ? (
          <Pressable
            style={({ pressed }) => [
              styles.unlockButton,
              pressed && styles.unlockButtonPressed,
              isAuthenticating && styles.unlockButtonDisabled,
            ]}
            onPress={handleUnlock}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? (
              <ActivityIndicator color={theme.colors.text} />
            ) : (
              <>
                <Text style={styles.unlockButtonIcon}>
                  {capability.availableTypes.includes("facial") ? "👤" : "👆"}
                </Text>
                <Text style={styles.unlockButtonText}>
                  Unlock with {biometricName}
                </Text>
              </>
            )}
          </Pressable>
        ) : (
          <View style={styles.unavailableContainer}>
            <Text style={styles.unavailableText}>
              {!capability.isSupported
                ? "Biometric authentication not supported on this device"
                : "No biometric credentials enrolled. Please set up Face ID or fingerprint in device settings."}
            </Text>
          </View>
        )}

        <Text style={styles.hint}>
          Your database connections are protected
        </Text>
      </View>
    </View>
  );
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    overlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
      zIndex: 9999,
    },
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    iconContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: theme.colors.surface,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 24,
      borderWidth: 2,
      borderColor: theme.colors.border,
    },
    lockIcon: {
      fontSize: 48,
    },
    title: {
      fontSize: 32,
      fontWeight: "bold",
      color: theme.colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 18,
      color: theme.colors.textSubtle,
      marginBottom: 32,
    },
    errorContainer: {
      backgroundColor: theme.colors.dangerMuted,
      padding: 16,
      borderRadius: 12,
      marginBottom: 24,
      maxWidth: 300,
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
    warningContainer: {
      backgroundColor: theme.colors.warningMuted,
      padding: 16,
      borderRadius: 12,
      marginBottom: 24,
      maxWidth: 300,
    },
    warningText: {
      color: theme.colors.warning,
      fontSize: 14,
      textAlign: "center",
    },
    loader: {
      marginBottom: 24,
    },
    unlockButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 16,
      borderRadius: 12,
      marginBottom: 24,
      gap: 12,
    },
    unlockButtonPressed: {
      opacity: 0.8,
    },
    unlockButtonDisabled: {
      opacity: 0.6,
    },
    unlockButtonIcon: {
      fontSize: 24,
    },
    unlockButtonText: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: "600",
    },
    unavailableContainer: {
      backgroundColor: theme.colors.surfaceMuted,
      padding: 16,
      borderRadius: 12,
      marginBottom: 24,
      maxWidth: 300,
    },
    unavailableText: {
      color: theme.colors.textSubtle,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
    hint: {
      color: theme.colors.textSubtle,
      fontSize: 12,
      textAlign: "center",
    },
  });

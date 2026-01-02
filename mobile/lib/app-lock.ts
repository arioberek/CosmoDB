import * as LocalAuthentication from "expo-local-authentication";

export type BiometricType = "fingerprint" | "facial" | "iris" | "none";

export type BiometricCapability = {
  isSupported: boolean;
  isEnrolled: boolean;
  securityLevel: LocalAuthentication.SecurityLevel;
  availableTypes: BiometricType[];
};

const AUTH_TYPE_MAP: Record<LocalAuthentication.AuthenticationType, BiometricType> = {
  [LocalAuthentication.AuthenticationType.FINGERPRINT]: "fingerprint",
  [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: "facial",
  [LocalAuthentication.AuthenticationType.IRIS]: "iris",
};

export async function checkBiometricCapability(): Promise<BiometricCapability> {
  const isSupported = await LocalAuthentication.hasHardwareAsync();
  
  if (!isSupported) {
    return {
      isSupported: false,
      isEnrolled: false,
      securityLevel: LocalAuthentication.SecurityLevel.NONE,
      availableTypes: [],
    };
  }

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
  const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

  const availableTypes = supportedTypes.map((t) => AUTH_TYPE_MAP[t]).filter(Boolean);

  return {
    isSupported,
    isEnrolled,
    securityLevel,
    availableTypes,
  };
}

export type AuthResult = {
  success: boolean;
  error?: string;
  warning?: string;
};

export async function authenticate(promptMessage?: string): Promise<AuthResult> {
  const capability = await checkBiometricCapability();

  if (!capability.isSupported) {
    return {
      success: false,
      error: "Biometric authentication is not supported on this device",
    };
  }

  if (!capability.isEnrolled) {
    return {
      success: false,
      error: "No biometric credentials enrolled. Please set up Face ID, Touch ID, or fingerprint in device settings.",
    };
  }

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage ?? "Authenticate to unlock COSMQ",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      fallbackLabel: "Use Passcode",
    });

    if (result.success) {
      return { success: true };
    }

    if (result.error === "user_cancel") {
      return {
        success: false,
        warning: "Authentication cancelled",
      };
    }

    if (result.error === "lockout") {
      return {
        success: false,
        error: "Too many failed attempts. Please try again later.",
      };
    }

    return {
      success: false,
      error: result.error ?? "Authentication failed",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Authentication error",
    };
  }
}

export function getBiometricDisplayName(types: BiometricType[]): string {
  if (types.includes("facial")) {
    return "Face ID";
  }
  if (types.includes("fingerprint")) {
    return "Touch ID / Fingerprint";
  }
  if (types.includes("iris")) {
    return "Iris Scanner";
  }
  return "Biometrics";
}

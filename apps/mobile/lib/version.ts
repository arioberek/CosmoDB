import Constants from 'expo-constants';

export const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

export const BUILD_NUMBER =
  Constants.expoConfig?.ios?.buildNumber ??
  Constants.expoConfig?.android?.versionCode?.toString() ??
  '1';

export const FULL_VERSION = `${APP_VERSION} (${BUILD_NUMBER})`;

export const VERSION_INFO = {
  version: APP_VERSION,
  buildNumber: BUILD_NUMBER,
  fullVersion: FULL_VERSION,
  runtimeVersion: Constants.expoConfig?.runtimeVersion,
} as const;

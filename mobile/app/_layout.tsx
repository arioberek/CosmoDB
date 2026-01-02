import "../polyfills";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "../hooks/useTheme";
import { useSettingsStore } from "../stores/settings";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    JetBrainsMono: require("../assets/fonts/JetBrainsMono-Regular.ttf"),
  });
  const theme = useTheme();
  const loadSettings = useSettingsStore((state) => state.loadSettings);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={theme.mode === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.surface,
            },
            headerTintColor: theme.colors.text,
            headerTitleStyle: {
              fontWeight: "bold",
            },
            contentStyle: {
              backgroundColor: theme.colors.background,
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{ title: "COSMQ" }}
          />
          <Stack.Screen
            name="connection/new"
            options={{ title: "New Connection", presentation: "modal" }}
          />
          <Stack.Screen
            name="connection/[id]"
            options={{ title: "Connection" }}
          />
          <Stack.Screen
            name="query/[connectionId]"
            options={{ title: "Query" }}
          />
          <Stack.Screen
            name="settings"
            options={{ title: "Settings" }}
          />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#1a1a2e" },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: "#16213e" },
          }}
        >
          <Stack.Screen
            name="index"
            options={{ title: "COSMQ", headerLargeTitle: true }}
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
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

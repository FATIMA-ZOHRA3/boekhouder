import React from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ActiveClientProvider } from "@/hooks/useActiveClient";
import { View, ActivityIndicator, Platform } from "react-native";
import { colors } from "@/constants/theme";

// ---------------------------------------------------------------------------
// Web-only "phone frame".
//
// `expo start --web` renders the exact same React Native layout in a plain
// browser tab, so on a desktop screen it just stretches edge-to-edge and
// looks like a webpage instead of a mobile app. This has no effect at all
// on iOS/Android (Platform.OS !== "web" there), so the native app is
// untouched — it only changes what you see when previewing in a browser.
// ---------------------------------------------------------------------------
function PhonePreviewFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <View
      style={{
        flex: 1,
        minHeight: "100vh" as unknown as number,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.border,
        padding: 24,
      }}
    >
      <View
        style={{
          width: 390, // iPhone 14/15-ish width
          height: 844,
          maxHeight: "90vh" as unknown as number,
          borderRadius: 40,
          borderWidth: 10,
          borderColor: "#111",
          overflow: "hidden",
          backgroundColor: colors.background,
          // subtle shadow so it reads as a device, not just a box
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)" as unknown as undefined,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// Protected-route guard: redirects between the (auth) group and the (tabs)
// group based on session state, so individual screens don't each need
// their own "am I logged in" check.
function RouteGuard({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (status === "loading") return;
    const inAuthGroup = segments[0] === "(auth)";

    if (status === "signed-out" && !inAuthGroup) {
      router.replace("/login");
    } else if (status === "signed-in" && inAuthGroup) {
      router.replace("/");
    }
  }, [status, segments, router]);

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ActiveClientProvider>
            <PhonePreviewFrame>
              <StatusBar style="dark" />
              <RouteGuard>
                <Slot />
              </RouteGuard>
            </PhonePreviewFrame>
          </ActiveClientProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

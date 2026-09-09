import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function PurchasesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Purchases" }} />
      <Stack.Screen name="scan" options={{ title: "Scan document", presentation: "modal" }} />
      <Stack.Screen name="[id]" options={{ title: "Document" }} />
    </Stack>
  );
}

import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function InvoicesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Invoices" }} />
      <Stack.Screen name="voice-invoice" options={{ title: "New invoice by voice" }} />
      <Stack.Screen name="[id]" options={{ title: "Invoice" }} />
    </Stack>
  );
}

import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function AccountingStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Accounting" }} />
    </Stack>
  );
}

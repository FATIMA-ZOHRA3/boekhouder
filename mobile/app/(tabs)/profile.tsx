import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, PrimaryButton, Avatar, ListRow, StatusBadge, FadeSlideIn } from "@/components/ui";
import { typography, spacing, colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";

function FieldRow({ icon, label, value, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | null | undefined; last?: boolean }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: spacing.md }}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[typography.bodyMuted, { flex: 1 }]}>{label}</Text>
      <Text style={typography.body}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { profile, role, isStaff, logout } = useAuth();
  const router = useRouter();
  const initials = (profile?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }}>
        <Text style={typography.h1}>Profile</Text>
        <Avatar initials={initials} tone="blue" />
      </View>

      <FadeSlideIn delay={0}>
        <Card style={{ marginBottom: spacing.lg, paddingVertical: 0 }}>
          <FieldRow icon="person-outline" label="Name" value={profile?.name} />
          <FieldRow icon="mail-outline" label="Email" value={profile?.email} />
          <FieldRow icon="business-outline" label="Company" value={profile?.company} />
          <FieldRow icon="receipt-outline" label="VAT number" value={profile?.vatNumber} />
          <FieldRow icon="card-outline" label="KVK number" value={profile?.kvkNumber} />
          <FieldRow icon="call-outline" label="Phone" value={profile?.phone} />
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: spacing.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: spacing.md }}>
              <Ionicons name="people-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[typography.bodyMuted, { flex: 1 }]}>Role</Text>
            {role ? <StatusBadge label={role.charAt(0).toUpperCase() + role.slice(1)} tone="neutral" /> : null}
          </View>
        </Card>
      </FadeSlideIn>

      {/* AI Assistant is reachable from here rather than as an extra bottom
          tab — keeps the main nav to 5 role-specific items (see
          app/(tabs)/_layout.tsx). Customers/Bank used to be listed here
          for every role, but GET /api/customers and GET /api/bank/transactions
          are scoped to the caller's OWN account/permission — for staff
          that meant "Customers" always came back empty (staff aren't a
          client themselves) and "Bank" only worked because it happened to
          require the bank.read permission staff have. Both are real
          per-client screens now, reachable from the Clients tab (tap a
          client → Customers / Bank) or, for Bank, the Accounting tab's
          "Unmatched bank transactions" card — not from a generic link
          that doesn't say whose data it's showing. */}
      <FadeSlideIn delay={70}>
        <Card style={{ marginBottom: spacing.xl, paddingVertical: 0 }}>
          <ListRow icon="sparkles-outline" tone="purple" title="AI Assistant" chevron onPress={() => router.push("/assistant")} last={isStaff} />
          {!isStaff ? (
            <>
              <ListRow icon="people-outline" tone="blue" title="Customers" chevron onPress={() => router.push("/customers")} />
              <ListRow icon="chatbubbles-outline" tone="green" title="Messages" chevron onPress={() => router.push("/conversations")} />
              <ListRow icon="document-attach-outline" tone="orange" title="Quotations" chevron onPress={() => router.push("/quotations")} />
              <ListRow icon="repeat-outline" tone="blue" title="Recurring invoices" chevron onPress={() => router.push("/recurring")} />
              <ListRow icon="checkbox-outline" tone="green" title="Tasks" chevron onPress={() => router.push("/tasks")} />
              <ListRow icon="calculator-outline" tone="purple" title="Tax & VAT" chevron onPress={() => router.push("/fiscal")} />
              <ListRow icon="alert-circle-outline" tone="red" title="Exceptions" chevron onPress={() => router.push("/exceptions")} last />
            </>
          ) : null}
        </Card>
      </FadeSlideIn>

      <FadeSlideIn delay={140}>
        <PrimaryButton title="Log out" onPress={() => logout()} />
      </FadeSlideIn>
      </ScrollView>
    </Screen>
  );
}

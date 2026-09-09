import React, { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Card, ErrorState, SkeletonDetail } from "@/components/ui";
import { colors, spacing, typography, tileTones, TileTone } from "@/constants/theme";
import { getClients } from "@/services/clients";
import { ApiError } from "@/services/api";
import { useActiveClient } from "@/hooks/useActiveClient";

function QuickLink({ icon, label, subtitle, tone = "blue", onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; subtitle?: string; tone?: TileTone; onPress: () => void }) {
  const c = tileTones[tone];
  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: c.bg,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          <Ionicons name={icon} size={18} color={c.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typography.body}>{label}</Text>
          {subtitle ? <Text style={typography.caption}>{subtitle}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm }}>
      <Text style={typography.bodyMuted}>{label}</Text>
      <Text style={typography.body}>{value}</Text>
    </View>
  );
}

// There's no GET /api/clients/[id] on the backend — only the list route
// (see src/app/api/clients/route.ts) — so the single client is resolved
// from the already-fetched, react-query-cached "clients" list (populated
// by the Clients tab) rather than a second network round trip.
export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["clients"],
    queryFn: getClients,
  });

  const client = data?.find((c) => c.id === id);

  // Opening a client from the Clients tab is what a bookkeeper means by
  // "select this client to work on" — so from here on, the Accounting
  // tab and every screen it links to default to this client instead of
  // the firm-wide portfolio, until explicitly cleared (see the "Client
  // actif" bar on those screens) or another client is opened.
  const { setActiveClient } = useActiveClient();
  useEffect(() => {
    if (client) setActiveClient({ id: client.id, name: client.company || client.name });
  }, [client, setActiveClient]);

  if (isLoading) return <SkeletonDetail />;
  if (isError) {
    return <ErrorState message={error instanceof ApiError ? error.message : "Could not load this client."} onRetry={() => refetch()} />;
  }
  if (!client) {
    return <ErrorState message="This client could not be found." />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={typography.h2}>{client.company || client.name}</Text>
        <Text style={[typography.bodyMuted, { marginBottom: spacing.md }]}>{client.name}</Text>
        <Row label="Email" value={client.email} />
        <Row label="Phone" value={client.phone} />
        <Row label="VAT number" value={client.vatNumber} />
        <Row label="KVK number" value={client.kvkNumber} />
      </Card>

      <Text style={[typography.h3, { marginBottom: spacing.md }]}>Manage</Text>
      <QuickLink icon="document-text-outline" label="Invoices" tone="blue" onPress={() => router.push(`/invoices?clientId=${client.id}`)} />
      <QuickLink icon="cart-outline" label="Purchases" tone="orange" onPress={() => router.push(`/purchases?clientId=${client.id}`)} />
      <QuickLink icon="business-outline" label="Bank transactions" tone="green" onPress={() => router.push(`/bank?clientId=${client.id}`)} />
      <QuickLink icon="calculator-outline" label="Fiscal / VAT" tone="purple" onPress={() => router.push(`/fiscal?clientId=${client.id}`)} />
      <QuickLink icon="people-outline" label="Customers" tone="blue" onPress={() => router.push(`/customers?clientId=${client.id}`)} />
      <QuickLink icon="chatbubbles-outline" label="Messages" tone="green" onPress={() => router.push(`/conversations?clientId=${client.id}`)} />
      <QuickLink
        icon="sparkles-outline"
        label="AI Insights"
        subtitle="AI-assisted summary of this client's numbers"
        tone="purple"
        onPress={() => router.push(`/financial-insights?clientId=${client.id}`)}
      />
      <QuickLink
        icon="time-outline"
        label="Activity"
        subtitle="Audit log for this client"
        tone="neutral"
        onPress={() => router.push(`/audit?clientId=${client.id}`)}
      />
      <QuickLink
        icon="camera-outline"
        label="Scan a purchase for this client"
        subtitle="Uploads on their behalf"
        tone="orange"
        onPress={() => router.push(`/purchases/scan?clientId=${client.id}`)}
      />

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

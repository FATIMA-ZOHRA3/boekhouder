import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ActiveClientBar, Screen, Card, EmptyState, ErrorState, StatusBadge, SkeletonList } from "@/components/ui";
import { colors, spacing, typography, radius, shadow, statusIconColors } from "@/constants/theme";
import { getPurchases, getAllPurchases } from "@/services/purchases";
import { getClients } from "@/services/clients";
import { formatCurrency, formatDate, statusLabel, statusTone } from "@/lib/format";
import type { PurchaseDocument } from "@/types/api";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useActiveClient } from "@/hooks/useActiveClient";

// Icon per BadgeTone — same pairing as the Invoices screen's statusIcon,
// so a purchase's leading icon color always matches its StatusBadge.
function statusIcon(tone: ReturnType<typeof statusTone>): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case "success":
      return "checkmark-circle";
    case "danger":
      return "alert-circle";
    case "info":
      return "sync-outline";
    default:
      return "time-outline";
  }
}

function PurchaseRow({ doc, onPress }: { doc: PurchaseDocument; onPress: () => void }) {
  const tone = statusTone(doc.status);
  const iconColor = statusIconColors[tone];
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center" }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: iconColor.bg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.md,
        }}
      >
        <Ionicons name={statusIcon(tone)} size={18} color={iconColor.fg} />
      </View>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={typography.h3}>{doc.supplierName || doc.label || doc.fileName}</Text>
        <Text style={[typography.bodyMuted, { marginTop: 2 }]}>
          {doc.documentDate ? formatDate(doc.documentDate) : formatDate(doc.createdAt.slice(0, 10))}
        </Text>
        {/* Only present when fetched cross-client via GET /api/purchases/all
            (see types/api.ts) — labels whose upload this is for a staff
            viewer. */}
        {doc.user ? <Text style={[typography.caption, { marginTop: 2 }]}>{doc.user.company || doc.user.name}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
        <Text style={typography.h3}>{doc.totalAmount != null ? formatCurrency(doc.totalAmount) : "—"}</Text>
        <StatusBadge label={statusLabel(doc.status)} tone={statusTone(doc.status)} />
      </View>
    </Card>
  );
}

// Reused for both roles (see app/(tabs)/_layout.tsx's header comment): a
// client sees their own uploads via GET /api/purchases. Staff reach this
// screen either scoped to one client (pushed from the Clients tab with a
// `clientId` param) or unscoped from the Accounting tab — which now uses
// the staff-only GET /api/purchases/all so a bookkeeper actually sees the
// cross-client validation queue, instead of their own (usually empty)
// uploads as before this fix.
export default function PurchasesListScreen() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const { clientId: paramClientId, status } = useLocalSearchParams<{ clientId?: string; status?: string }>();
  // Falls back to the active client (set from the Clients tab) when this
  // screen is reached via the Accounting tab's own "Purchases to
  // validate" card rather than an explicit per-client link — this is the
  // fix for a bookkeeper selecting a client and then seeing every
  // client's purchases mixed together on that card.
  const { activeClient, clearActiveClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: isStaff ? ["purchases-all", clientId ?? "all", status ?? "all"] : ["purchases"],
    queryFn: () => (isStaff ? getAllPurchases({ clientId, status }) : getPurchases()),
  });

  // Same "Client: X" indicator as the Invoices screen — a visible reminder
  // that a bookkeeper is viewing a client's purchases, not acting as them.
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: isStaff && !!clientId });
  const selectedClient = clientId ? clientsQuery.data?.find((c) => c.id === clientId) : undefined;

  return (
    <Screen style={{ padding: 0 }}>
      <View style={{ flex: 1, padding: spacing.lg }}>
        {selectedClient ? (
          <ActiveClientBar
            name={selectedClient.company || selectedClient.name}
            onExit={() => {
              clearActiveClient();
              router.setParams({ clientId: undefined });
            }}
          />
        ) : null}
        {isLoading ? (
          <SkeletonList />
        ) : isError ? (
          <ErrorState
            message={error instanceof ApiError ? error.message : "Could not load purchases."}
            onRetry={() => refetch()}
          />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No purchases yet" subtitle="Scan a receipt or invoice to get started." />
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PurchaseRow doc={item} onPress={() => router.push(`/purchases/${item.id}`)} />
            )}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Staff upload on behalf of a client only makes sense once a client
          is selected (Client detail screen) — the floating scan button
          only appears there, or for a client's own uploads. */}
      {!isStaff || clientId ? (
        <Pressable
          onPress={() => router.push(clientId ? `/purchases/scan?clientId=${clientId}` : "/purchases/scan")}
          style={({ pressed }) => [
            {
              position: "absolute",
              right: spacing.xl,
              bottom: spacing.xl,
              width: 56,
              height: 56,
              borderRadius: radius.pill,
              backgroundColor: colors.brandPrimary,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
            shadow.card,
          ]}
        >
          <Ionicons name="camera" size={24} color={colors.textOnPrimary} />
        </Pressable>
      ) : null}
    </Screen>
  );
}

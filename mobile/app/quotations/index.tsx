import React, { useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen, Card, Input, EmptyState, ErrorState, StatusBadge, SkeletonList } from "@/components/ui";
import { colors, spacing, typography, statusIconColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { getQuotations } from "@/services/quotations";
import { formatCurrency, formatDate, statusTone, statusLabel } from "@/lib/format";
import type { Quotation } from "@/types/api";
import { ApiError } from "@/services/api";

// Icon per BadgeTone — same pairing as Invoices/Purchases' statusIcon.
function statusIcon(tone: ReturnType<typeof statusTone>): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case "success":
      return "checkmark-circle";
    case "danger":
      return "alert-circle";
    case "info":
      return "paper-plane";
    default:
      return "time-outline";
  }
}

// Client-only screen (reachable from Profile — see app/(tabs)/profile.tsx),
// same list+detail+PDF pattern as app/(tabs)/invoices — no create/edit
// flow on mobile yet, matching how invoices are read-only here too.
function QuotationRow({ quotation, onPress }: { quotation: Quotation; onPress: () => void }) {
  const tone = statusTone(quotation.status);
  const iconColor = statusIconColors[tone];
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "flex-start" }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: iconColor.bg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.md,
          marginTop: 2,
        }}
      >
        <Ionicons name={statusIcon(tone)} size={18} color={iconColor.fg} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={typography.h3}>{quotation.customerName}</Text>
          <Text style={[typography.bodyMuted, { marginTop: 2 }]}>
            #{quotation.quotationNumber} · {formatDate(quotation.date)}
          </Text>
          <Text style={typography.caption}>Valid until {formatDate(quotation.validUntil)}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
          <Text style={[typography.h3, { color: colors.primary }]}>{formatCurrency(quotation.total)}</Text>
          <StatusBadge label={statusLabel(quotation.status)} tone={statusTone(quotation.status)} />
        </View>
      </View>
    </Card>
  );
}

export default function QuotationsListScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["quotations"],
    queryFn: () => getQuotations(),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (quo) => quo.customerName.toLowerCase().includes(q) || quo.quotationNumber.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Quotations", headerStyle: { backgroundColor: colors.surface } }} />
      <Input
        placeholder="Search customer or quotation #"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        style={{ marginBottom: spacing.lg }}
      />

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Could not load quotations."}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No quotations"
          subtitle={search ? "No quotation matches your search." : "Quotations you create will show up here."}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <QuotationRow quotation={item} onPress={() => router.push(`/quotations/${item.id}`)} />
          )}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

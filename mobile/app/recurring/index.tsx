import React from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, EmptyState, ErrorState, StatusBadge, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getRecurringInvoices, setRecurringInvoiceActive, deleteRecurringInvoice } from "@/services/recurring";
import { formatDate } from "@/lib/format";
import type { RecurringInvoice } from "@/types/api";
import { ApiError } from "@/services/api";

// Client-only screen (reachable from Profile). Read + toggle "active" +
// delete only — no create/edit form on mobile yet: building a customer
// picker + line-item template editor was judged out of scope for this
// pass (see mobile/README.md). The web client portal (src/app/client/
// recurring/page.tsx) remains the place to create a new recurring
// invoice; this screen manages ones that already exist.
const intervalLabels: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function RecurringRow({ item }: { item: RecurringInvoice }) {
  const queryClient = useQueryClient();

  const toggleActive = async () => {
    // Optimistic-ish: refetch after the call rather than hand-rolling
    // cache patching, since this list is small and rarely changes.
    try {
      await setRecurringInvoiceActive(item.id, !item.active);
      queryClient.invalidateQueries({ queryKey: ["recurring-invoices"] });
    } catch {
      Alert.alert("Could not update", "Please try again.");
    }
  };

  const confirmDelete = () => {
    Alert.alert("Delete recurring invoice?", "This will stop future invoices from being generated for this schedule.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteRecurringInvoice(item.id);
            queryClient.invalidateQueries({ queryKey: ["recurring-invoices"] });
          } catch {
            Alert.alert("Could not delete", "Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={typography.h3}>{item.customer.name}</Text>
          <Text style={[typography.bodyMuted, { marginTop: 2 }]}>
            {intervalLabels[item.interval] || item.interval} · Next: {formatDate(item.nextDate)}
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm }}>
            <StatusBadge label={item.active ? "Active" : "Paused"} tone={item.active ? "success" : "warning"} />
            {item.autoSend ? <StatusBadge label="Auto-send" tone="info" /> : null}
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.md }}>
          <Switch
            value={item.active}
            onValueChange={toggleActive}
            trackColor={{ false: colors.border, true: colors.brandPrimary }}
          />
          <Pressable onPress={confirmDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

export default function RecurringInvoicesScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["recurring-invoices"],
    queryFn: getRecurringInvoices,
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: "Recurring invoices", headerStyle: { backgroundColor: colors.surface } }} />
      {isLoading ? (
        <SkeletonList withTrailing={false} />
      ) : isError ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Could not load recurring invoices."}
          onRetry={() => refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No recurring invoices" subtitle="Scheduled invoices you set up will show up here." />
      ) : (
        // Small list, no FlatList needed — mirrors Customers screen's
        // simplicity for similarly short lists — but still scrollable
        // with pull-to-refresh like every other list screen.
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        >
          {data.map((item) => (
            <RecurringRow key={item.id} item={item} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Card, EmptyState, ErrorState, StatusBadge, SkeletonList, FadeSlideIn } from "@/components/ui";
import { colors, spacing, typography, radius } from "@/constants/theme";
import { getFinancialInsights } from "@/services/ai";
import { getClients } from "@/services/clients";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import type { FinancialInsight, InsightPeriod, InsightPriority } from "@/types/api";

const PERIODS: { value: InsightPeriod; label: string }[] = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
];

function priorityTone(priority: InsightPriority): "danger" | "warning" | "info" {
  if (priority === "critical" || priority === "high") return "danger";
  if (priority === "medium") return "warning";
  return "info";
}

function InsightCard({ insight }: { insight: FinancialInsight }) {
  return (
    <Card style={{ marginBottom: spacing.md }} accessible accessibilityLabel={`${insight.title}. ${insight.summary}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm }}>
        <Text style={[typography.h3, { flex: 1, marginRight: spacing.md }]}>{insight.title}</Text>
        <StatusBadge label={insight.priority} tone={priorityTone(insight.priority)} />
      </View>
      <Text style={typography.body}>{insight.summary}</Text>
      {insight.metricLabel ? (
        <Text style={[typography.h2, { marginTop: spacing.sm, marginBottom: spacing.sm }]}>{insight.metricLabel}</Text>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.sm }} />
      <Text style={[typography.bodyMuted, { marginBottom: spacing.xs }]}>{insight.whyItMatters}</Text>
      <Text style={typography.bodyMuted}>{insight.whatToConsider}</Text>
      {insight.aiEnhanced ? (
        <Text style={[typography.caption, { marginTop: spacing.sm }]}>✨ AI-enhanced explanation</Text>
      ) : null}
    </Card>
  );
}

// GET /api/ai/financial-insights — staff-only server-side ("ai.use"), so
// this screen is only reachable from a client's context (see the
// "Financial insights" QuickLink in app/(tabs)/clients/[id].tsx). A client
// account never sees an entry point to this screen — the backend
// permission for `ai.use` doesn't include the client role, and this
// screen doesn't weaken or bypass that.
export default function FinancialInsightsScreen() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();

  useEffect(() => {
    if (!isStaff || !clientId) router.replace("/");
  }, [isStaff, clientId, router]);

  if (!isStaff || !clientId) return null;

  // Remounts on client switch so the period selector resets to "This
  // month" for the new client instead of keeping whatever period was
  // picked for the previous one.
  return <FinancialInsightsContent key={clientId} clientId={clientId} isStaff={isStaff} />;
}

function FinancialInsightsContent({ clientId, isStaff }: { clientId: string; isStaff: boolean }) {
  const [period, setPeriod] = useState<InsightPeriod>("this_month");

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["financial-insights", clientId, period],
    queryFn: () => getFinancialInsights(clientId, period),
  });

  // Reuses the same ["clients"] cache the Clients tab/Client detail screen
  // already populate — just for the "Client: X" header label, no extra
  // network round trip in the common case of arriving from that screen.
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: isStaff });
  const client = clients?.find((c) => c.id === clientId);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "AI Insights", headerStyle: { backgroundColor: colors.surface } }} />

      {client ? (
        <Text style={[typography.bodyMuted, { marginBottom: spacing.md }]}>Client: {client.company || client.name}</Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {PERIODS.map((p) => {
            const active = p.value === period;
            return (
              <Pressable
                key={p.value}
                onPress={() => setPeriod(p.value)}
                accessibilityRole="button"
                accessibilityLabel={p.label}
                accessibilityState={{ selected: active }}
                style={{
                  minHeight: 44,
                  paddingHorizontal: spacing.lg,
                  justifyContent: "center",
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.brandPrimary : colors.surface,
                  borderWidth: active ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ color: active ? colors.textOnPrimary : colors.textPrimary, fontWeight: "600", fontSize: 13 }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {isLoading ? (
        <SkeletonList count={4} withTrailing={false} />
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : "Could not load financial insights."} onRetry={() => refetch()} />
      ) : !data || data.insights.length === 0 ? (
        <EmptyState title="No insights yet" subtitle="Nothing notable for this period — check back after more activity." />
      ) : (
        <>
          {!data.aiAvailable ? (
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={typography.caption}>AI enrichment is unavailable right now — figures below are still accurate, based on real data.</Text>
            </Card>
          ) : null}
          {data.insights.map((insight, i) => (
            <FadeSlideIn key={insight.id} delay={Math.min(i, 6) * 50}>
              <InsightCard insight={insight} />
            </FadeSlideIn>
          ))}
          <Text style={[typography.caption, { textAlign: "center", marginTop: spacing.sm }]}>
            AI-generated insight. Verify important accounting decisions.
          </Text>
        </>
      )}
      {isRefetching && !isLoading ? <Text style={[typography.caption, { textAlign: "center", marginTop: spacing.sm }]}>Refreshing…</Text> : null}
    </ScrollView>
  );
}

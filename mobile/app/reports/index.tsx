import React, { useEffect, useMemo, useRef } from "react";
import { Animated, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen, Card, ErrorState, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getInvoices } from "@/services/invoices";
import { getAllPurchases } from "@/services/purchases";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";

// Staff-only screen (reachable from the Accounting hub). Mirrors
// src/app/bookkeeper/reports/page.tsx's two headline reports — an
// invoice-aging breakdown and top expense categories — computed from the
// same cross-client invoice/purchase data the rest of the app already
// pulls (GET /api/invoices, GET /api/purchases/all, both unscoped =
// every client, same convention as the Accounting hub). Nothing here is
// a new backend computation; it's the same figures the web Reports page
// derives client-side, just re-derived here from the mobile API calls.
type AgingBuckets = { current: number; d30: number; d60: number; d90plus: number };

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  // Bars fill in on mount instead of appearing at full length instantly —
  // a small "premium data viz" touch for the reports/insights screens
  // (section 8: subtle animation with a clear reason, not decoration).
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, { toValue: pct, duration: 500, useNativeDriver: false }).start();
  }, [pct, widthAnim]);
  const width = widthAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={typography.bodyMuted}>{label}</Text>
        <Text style={typography.body}>{formatCurrency(value)}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
        <Animated.View style={{ width, height: "100%", backgroundColor: tone || colors.brandPrimary }} />
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isStaff) router.replace("/");
  }, [isStaff, router]);

  const invoicesQuery = useQuery({ queryKey: ["invoices", "all"], queryFn: () => getInvoices(), enabled: isStaff });
  const purchasesQuery = useQuery({ queryKey: ["purchases-all", "reports"], queryFn: () => getAllPurchases(), enabled: isStaff });

  const loading = invoicesQuery.isLoading || purchasesQuery.isLoading;
  const isRefetching = invoicesQuery.isRefetching || purchasesQuery.isRefetching;
  const hasError = invoicesQuery.isError || purchasesQuery.isError;
  const refetchAll = () => {
    invoicesQuery.refetch();
    purchasesQuery.refetch();
  };

  const aging = useMemo<AgingBuckets>(() => {
    const buckets: AgingBuckets = { current: 0, d30: 0, d60: 0, d90plus: 0 };
    const today = new Date();
    (invoicesQuery.data || [])
      .filter((i) => (i.status === "sent" || i.status === "overdue") && !i.isCredit)
      .forEach((i) => {
        const due = new Date(i.dueDate);
        const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
        const remaining = i.total - i.paidAmount;
        if (days <= 0) buckets.current += remaining;
        else if (days <= 30) buckets.d30 += remaining;
        else if (days <= 60) buckets.d60 += remaining;
        else buckets.d90plus += remaining;
      });
    return buckets;
  }, [invoicesQuery.data]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    (purchasesQuery.data || []).forEach((p) => {
      const key = p.category || "Uncategorized";
      map.set(key, (map.get(key) || 0) + (p.totalAmount || 0));
    });
    return Array.from(map.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [purchasesQuery.data]);

  if (!isStaff) return null;

  const totalOpen = aging.current + aging.d30 + aging.d60 + aging.d90plus;
  const maxExpense = Math.max(1, ...expensesByCategory.map((e) => e.total));

  return (
    <Screen>
      <Stack.Screen options={{ title: "Reports", headerStyle: { backgroundColor: colors.surface } }} />
      {loading ? (
        <SkeletonList withTrailing={false} />
      ) : hasError ? (
        <ErrorState message="Could not load report data." onRetry={refetchAll} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
          showsVerticalScrollIndicator={false}
        >
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h3, { marginBottom: spacing.xs }]}>Outstanding invoice aging</Text>
            <Text style={[typography.bodyMuted, { marginBottom: spacing.lg }]}>
              {totalOpen > 0 ? `${formatCurrency(totalOpen)} outstanding across every client` : "Nothing outstanding right now"}
            </Text>
            <Bar label="Current" value={aging.current} max={totalOpen} tone={colors.success} />
            <Bar label="1–30 days overdue" value={aging.d30} max={totalOpen} tone={colors.warning} />
            <Bar label="31–60 days overdue" value={aging.d60} max={totalOpen} tone={colors.warning} />
            <Bar label="60+ days overdue" value={aging.d90plus} max={totalOpen} tone={colors.danger} />
          </Card>

          <Card style={{ marginBottom: spacing.xl }}>
            <Text style={[typography.h3, { marginBottom: spacing.lg }]}>Top expense categories</Text>
            {expensesByCategory.length === 0 ? (
              <Text style={typography.bodyMuted}>No purchase documents yet.</Text>
            ) : (
              expensesByCategory.map((e) => (
                <Bar key={e.category} label={e.category} value={e.total} max={maxExpense} />
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

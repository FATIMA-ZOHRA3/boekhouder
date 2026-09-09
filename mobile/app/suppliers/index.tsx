import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, LayoutAnimation, Platform, Pressable, RefreshControl, ScrollView, Text, UIManager, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getAllPurchases } from "@/services/purchases";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";

// Staff-only screen (reachable from the Accounting hub). Mirrors
// src/app/bookkeeper/suppliers/page.tsx: there is no Supplier model in the
// schema, so this groups the real cross-client purchase documents
// (GET /api/purchases/all, unscoped = every client, same convention as
// the Accounting hub's other cards) by their free-text supplierName,
// rather than inventing a table that doesn't exist server-side.
type Supplier = {
  name: string;
  count: number;
  total: number;
  lastDate: string;
  docs: { id: string; documentDate: string | null; totalAmount: number | null }[];
};

// Smooth expand/collapse instead of an instant show/hide (section 8/9:
// "changement d'état doux") — Android needs the experimental flag turned
// on once for LayoutAnimation to take effect.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function SupplierRow({ supplier }: { supplier: Supplier }) {
  const [expanded, setExpanded] = useState(false);
  const rotate = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(rotate, { toValue: expanded ? 0 : 1, duration: 180, useNativeDriver: true }).start();
    setExpanded((e) => !e);
  };

  const chevronRotate = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Pressable onPress={toggle}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={typography.h3}>{supplier.name}</Text>
            <Text style={[typography.bodyMuted, { marginTop: 2 }]}>
              {supplier.count} document{supplier.count === 1 ? "" : "s"}
              {supplier.lastDate ? ` · last on ${formatDate(supplier.lastDate)}` : ""}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Text style={typography.h3}>{formatCurrency(supplier.total)}</Text>
            <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </Animated.View>
          </View>
        </View>
      </Pressable>
      {expanded ? (
        <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.xs }}>
          {supplier.docs.map((d) => (
            <View key={d.id} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={typography.bodyMuted}>{d.documentDate ? formatDate(d.documentDate) : "—"}</Text>
              <Text style={typography.body}>{formatCurrency(d.totalAmount || 0)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export default function SuppliersScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isStaff) router.replace("/");
  }, [isStaff, router]);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["purchases-all", "suppliers"],
    queryFn: () => getAllPurchases(),
    enabled: isStaff,
  });

  const suppliers = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, Supplier>();
    for (const doc of data) {
      const name = doc.supplierName?.trim() || "Unknown supplier";
      const entry = map.get(name) || { name, count: 0, total: 0, lastDate: "", docs: [] };
      entry.count += 1;
      entry.total += doc.totalAmount || 0;
      entry.docs.push({ id: doc.id, documentDate: doc.documentDate, totalAmount: doc.totalAmount });
      if (doc.documentDate && doc.documentDate > entry.lastDate) entry.lastDate = doc.documentDate;
      map.set(name, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  if (!isStaff) return null;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Suppliers", headerStyle: { backgroundColor: colors.surface } }} />
      {isLoading ? (
        <SkeletonList withTrailing={false} />
      ) : isError ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Could not load suppliers."}
          onRetry={() => refetch()}
        />
      ) : suppliers.length === 0 ? (
        <EmptyState title="No suppliers yet" subtitle="Suppliers appear once purchase documents are uploaded." />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        >
          {suppliers.map((s) => (
            <SupplierRow key={s.name} supplier={s} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

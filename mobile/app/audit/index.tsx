import React, { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Card, EmptyState, ErrorState, Input, PrimaryButton, SkeletonList, ActiveClientBar } from "@/components/ui";
import { colors, spacing, typography, radius } from "@/constants/theme";
import { getAuditLogs } from "@/services/audit";
import { getClients } from "@/services/clients";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useActiveClient } from "@/hooks/useActiveClient";
import type { AuditEntity, AuditLogItem } from "@/types/api";

function AuditRow({ item }: { item: AuditLogItem }) {
  return (
    <Card style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={[typography.body, { flex: 1, marginRight: spacing.md }]}>{item.description}</Text>
        {item.amountLabel ? <Text style={[typography.body, { fontWeight: "600" }]}>{item.amountLabel}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs }}>
        <Text style={typography.caption}>{item.actorName}</Text>
        <Text style={typography.caption}>
          {new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </Card>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        minHeight: 36,
        paddingHorizontal: spacing.md,
        justifyContent: "center",
        borderRadius: radius.pill,
        backgroundColor: active ? colors.brandPrimary : colors.surface,
        borderWidth: active ? 0 : 1,
        borderColor: colors.border,
        marginRight: spacing.sm,
      }}
    >
      <Text style={{ color: active ? colors.textOnPrimary : colors.textPrimary, fontWeight: "600", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

// GET /api/audit-logs is staff-only server-side — a client account gets a
// 403, and there's no client-visible activity feed anywhere in the
// backend (confirmed by reading src/app/api/audit-logs/route.ts and the
// Prisma AuditLog model), so this screen never gets an entry point on the
// client side and redirects away if reached directly. `clientId` scopes
// to one administration (reached from that client's detail screen);
// without it, the backend itself only returns firm-wide entries (never
// "every client merged together" — see buildScopeWhere() server-side).
export default function AuditLogScreen() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const { clientId: paramClientId } = useLocalSearchParams<{ clientId?: string }>();
  const { activeClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;

  useEffect(() => {
    if (!isStaff) router.replace("/");
  }, [isStaff, router]);

  if (!isStaff) return null;

  // Remounts on client switch so the search box, entity-type chip, and
  // infinite-scroll pagination all start clean for the new client instead
  // of carrying over the previous client's filters/search text.
  return <AuditLogContent key={clientId ?? "firm-wide"} clientId={clientId} />;
}

function AuditLogContent({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const { clearActiveClient } = useActiveClient();
  const [entity, setEntity] = useState<AuditEntity | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce free-text search so every keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: !!clientId });
  const client = clients?.find((c) => c.id === clientId);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["audit-logs", clientId ?? "firm-wide", entity ?? "all", query],
    queryFn: ({ pageParam }) => getAuditLogs({ clientId, entity: entity ?? undefined, q: query || undefined, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const availableEntities = data?.pages[0]?.availableEntities ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Activity Log", headerStyle: { backgroundColor: colors.surface } }} />

      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        {client ? (
          <ActiveClientBar
            name={client.company || client.name}
            onExit={() => {
              clearActiveClient();
              router.setParams({ clientId: undefined });
            }}
          />
        ) : null}
        <Input value={searchInput} onChangeText={setSearchInput} placeholder="Search activity…" style={{ marginBottom: spacing.md }} />
        {availableEntities.length > 0 ? (
          <FlatList
            data={availableEntities}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(e) => e}
            renderItem={({ item: e }) => <Chip label={e} active={entity === e} onPress={() => setEntity(entity === e ? null : e)} />}
          />
        ) : null}
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <SkeletonList count={6} withTrailing={false} />
        </View>
      ) : isError ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <ErrorState message={error instanceof ApiError ? error.message : "Could not load the activity log."} onRetry={() => refetch()} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState title="No activity" subtitle="Nothing matches these filters yet." />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AuditRow item={item} />}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={refetch}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          ListFooterComponent={
            hasNextPage ? (
              <View style={{ marginTop: spacing.sm }}>
                <PrimaryButton title="Load more" onPress={() => fetchNextPage()} loading={isFetchingNextPage} />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

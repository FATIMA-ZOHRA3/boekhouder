import React, { useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, Input, EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getClients } from "@/services/clients";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import type { ClientSummary } from "@/types/api";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function ClientRow({ client, onPress }: { client: ClientSummary; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center" }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.primaryLight,
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.md,
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: "700" }}>{initials(client.company || client.name)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={typography.h3}>{client.company || client.name}</Text>
        <Text style={[typography.bodyMuted, { marginTop: 2 }]}>{client.name}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Card>
  );
}

// Staff-only screen (see app/(tabs)/_layout.tsx — hidden from a client's
// tab bar via href: null). GET /api/clients itself already returns only
// the caller's own record for a non-staff session (see
// src/app/api/clients/route.ts), so this redirect is a friendly landing
// rather than the actual security boundary, for the case of a client
// account reaching this route directly (e.g. a stale deep link).
export default function ClientsListScreen() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isStaff) router.replace("/");
  }, [isStaff, router]);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["clients"],
    queryFn: getClients,
    enabled: isStaff,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q)
    );
  }, [data, search]);

  if (!isStaff) return null;

  return (
    <Screen>
      <Input
        placeholder="Search clients"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        style={{ marginBottom: spacing.lg }}
      />
      {isLoading ? (
        <SkeletonList withTrailing={false} />
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : "Could not load clients."} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No clients" subtitle={search ? "No client matches your search." : "Clients you manage will show up here."} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ClientRow client={item} onPress={() => router.push(`/clients/${item.id}`)} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

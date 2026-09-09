import React, { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActiveClientBar, Screen, Card, Input, EmptyState, ErrorState, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getCustomers } from "@/services/customers";
import { getClients } from "@/services/clients";
import { ApiError } from "@/services/api";
import { useActiveClient } from "@/hooks/useActiveClient";
import type { Customer } from "@/types/api";

function CustomerRow({ customer }: { customer: Customer }) {
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={typography.h3}>{customer.name}</Text>
      {customer.email ? <Text style={[typography.bodyMuted, { marginTop: 2 }]}>{customer.email}</Text> : null}
      {customer.city ? <Text style={typography.caption}>{[customer.postalCode, customer.city].filter(Boolean).join(" ")}</Text> : null}
    </Card>
  );
}

export default function CustomersScreen() {
  const { clientId: paramClientId } = useLocalSearchParams<{ clientId?: string }>();
  const { activeClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;
  // Resets the search box when the comptable switches client, instead of
  // filtering the new client's list with leftover text from the last one.
  return <CustomersContent key={clientId ?? "own"} clientId={clientId} />;
}

function CustomersContent({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const { clearActiveClient } = useActiveClient();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["customers", clientId ?? "own"],
    queryFn: () => getCustomers(clientId),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }, [data, search]);

  // "Client: X" indicator — only ever meaningful when `clientId` is set,
  // which only happens when a bookkeeper reached this screen from a
  // Client detail screen (a client viewing their own customers never has
  // one) — same pattern as every other client-scoped screen.
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: !!clientId });
  const selectedClient = clientId ? clientsQuery.data?.find((c) => c.id === clientId) : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Customers", headerStyle: { backgroundColor: colors.surface } }} />
      {selectedClient ? (
        <ActiveClientBar
          name={selectedClient.company || selectedClient.name}
          onExit={() => {
            clearActiveClient();
            router.setParams({ clientId: undefined });
          }}
        />
      ) : null}
      <Input placeholder="Search customers" value={search} onChangeText={setSearch} style={{ marginBottom: spacing.lg }} />
      {isLoading ? (
        <SkeletonList withTrailing={false} />
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : "Could not load customers."} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No customers" subtitle={search ? "No customer matches your search." : "Customers you add will show up here."} />
      ) : (
        <FlatList data={filtered} keyExtractor={(c) => c.id} renderItem={({ item }) => <CustomerRow customer={item} />} showsVerticalScrollIndicator={false} />
      )}
    </Screen>
  );
}

import React from "react";
import { FlatList, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActiveClientBar, Screen, Card, EmptyState, ErrorState, StatusBadge, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getBankTransactions } from "@/services/bank";
import { getClients } from "@/services/clients";
import { formatCurrency, formatDate, statusLabel, statusTone } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useActiveClient } from "@/hooks/useActiveClient";
import type { BankTransaction } from "@/types/api";

function TransactionRow({ tx }: { tx: BankTransaction }) {
  const isCredit = tx.direction === "credit";
  return (
    <Card style={{ marginBottom: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={typography.body}>{tx.counterparty || tx.description}</Text>
        <Text style={[typography.caption, { marginTop: 2 }]}>{formatDate(tx.transactionDate)}</Text>
        {tx.user ? <Text style={typography.caption}>{tx.user.company || tx.user.name}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
        <Text style={[typography.h3, { color: isCredit ? colors.success : colors.textPrimary }]}>
          {isCredit ? "+" : "-"}
          {formatCurrency(Math.abs(tx.amount))}
        </Text>
        {tx.status !== "new" ? <StatusBadge label={statusLabel(tx.status)} tone={statusTone(tx.status)} /> : null}
      </View>
    </Card>
  );
}

export default function BankScreen() {
  const { isStaff } = useAuth();
  const { clientId: paramClientId, status } = useLocalSearchParams<{ clientId?: string; status?: string }>();
  const router = useRouter();
  const { activeClient, clearActiveClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;
  // GET /api/bank/transactions itself already enforces the "bank.read"
  // permission server-side (403 for client accounts) — this is just a
  // friendlier message than an error toast for the (unreachable via the
  // normal UI) case of a client landing here directly.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["bank-transactions", clientId ?? "all", status ?? "all"],
    queryFn: () => getBankTransactions({ clientId, status }),
    enabled: isStaff,
  });

  // "Client: X" indicator — same as Invoices/Purchases/Fiscal/Audit/
  // Financial Insights: a visible reminder of which client's transactions
  // this bookkeeper is viewing.
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: isStaff && !!clientId });
  const selectedClient = clientId ? clientsQuery.data?.find((c) => c.id === clientId) : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Bank", headerStyle: { backgroundColor: colors.surface } }} />
      {selectedClient ? (
        <ActiveClientBar
          name={selectedClient.company || selectedClient.name}
          onExit={() => {
            clearActiveClient();
            router.setParams({ clientId: undefined });
          }}
        />
      ) : null}
      {!isStaff ? (
        <EmptyState title="Not available" subtitle="Bank transactions are managed by your bookkeeper." />
      ) : isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : "Could not load transactions."} onRetry={() => refetch()} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No transactions" subtitle="Imported bank transactions will show up here." />
      ) : (
        <FlatList data={data} keyExtractor={(t) => t.id} renderItem={({ item }) => <TransactionRow tx={item} />} showsVerticalScrollIndicator={false} />
      )}
    </Screen>
  );
}

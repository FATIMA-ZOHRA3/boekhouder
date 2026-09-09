import React from "react";
import { FlatList, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActiveClientBar, Screen, Card, EmptyState, ErrorState, StatusBadge, SkeletonList } from "@/components/ui";
import { colors, spacing, typography, statusIconColors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { getExceptions } from "@/services/exceptions";
import { getClients } from "@/services/clients";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useActiveClient } from "@/hooks/useActiveClient";
import type { ExceptionItem } from "@/types/api";

function severityTone(severity: ExceptionItem["severity"]): "danger" | "warning" | "info" {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "info";
}

function severityIcon(tone: "danger" | "warning" | "info"): keyof typeof Ionicons.glyphMap {
  if (tone === "danger") return "alert-circle";
  if (tone === "warning") return "warning";
  return "information-circle";
}

function ExceptionRow({ item, showClient, onPress }: { item: ExceptionItem; showClient: boolean; onPress: () => void }) {
  const tone = severityTone(item.severity);
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
        <Ionicons name={severityIcon(tone)} size={18} color={iconColor.fg} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={typography.h3}>{item.title}</Text>
          <Text style={[typography.bodyMuted, { marginTop: 2 }]} numberOfLines={2}>
            {item.description}
          </Text>
          {showClient ? <Text style={[typography.caption, { marginTop: spacing.xs }]}>{item.user.company || item.user.name}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
          <StatusBadge label={item.severity} tone={severityTone(item.severity)} />
          <Text style={typography.caption}>{formatDate(item.createdAt.slice(0, 10))}</Text>
        </View>
      </View>
    </Card>

  );
}

// GET /api/exceptions is identity-aware: staff (bookkeeper/admin) get
// every exception across every client, a client account gets only their
// own — see src/app/api/exceptions/route.ts. No role branching needed
// here beyond labelling rows with the owning client for staff.
//
// `clientId` (explicit param, e.g. from a Client detail screen, or the
// active client set from the Clients tab — see hooks/useActiveClient.tsx)
// narrows the firm-wide list down to one client, same convention as
// Purchases/Invoices/Bank/Audit.
export default function ExceptionsScreen() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const { clientId: paramClientId } = useLocalSearchParams<{ clientId?: string }>();
  const { activeClient, clearActiveClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["exceptions", clientId ?? "all"],
    queryFn: () => getExceptions(clientId),
  });

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: isStaff && !!clientId });
  const selectedClient = clientId ? clientsQuery.data?.find((c) => c.id === clientId) : undefined;

  const open = data?.filter((e) => e.status !== "resolved") ?? [];
  const resolved = data?.filter((e) => e.status === "resolved") ?? [];
  const ordered = [...open, ...resolved];

  return (
    <Screen>
      <Stack.Screen options={{ title: "Exceptions", headerStyle: { backgroundColor: colors.surface } }} />
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
        <ErrorState message={error instanceof ApiError ? error.message : "Could not load exceptions."} onRetry={() => refetch()} />
      ) : ordered.length === 0 ? (
        <EmptyState title="No exceptions" subtitle="Anything that needs your attention will show up here." />
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <ExceptionRow item={item} showClient={isStaff} onPress={() => router.push(`/exceptions/${item.id}`)} />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

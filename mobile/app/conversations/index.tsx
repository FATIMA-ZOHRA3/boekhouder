import React from "react";
import { FlatList, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActiveClientBar, Screen, Card, EmptyState, ErrorState, StatusBadge, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getConversations } from "@/services/conversations";
import { getClients } from "@/services/clients";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useActiveClient } from "@/hooks/useActiveClient";
import type { Conversation } from "@/types/api";

function ConversationRow({ conversation, showClient, unread, onPress }: { conversation: Conversation; showClient: boolean; unread: boolean; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={typography.h3}>{conversation.subject}</Text>
          {conversation.lastMessage ? (
            <Text style={[typography.bodyMuted, { marginTop: 2 }]} numberOfLines={2}>
              {conversation.lastMessage}
            </Text>
          ) : null}
          {showClient ? (
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>
              {conversation.user.company || conversation.user.name}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
          {unread ? <StatusBadge label="New" tone="info" /> : null}
          <Text style={typography.caption}>{formatDate(conversation.lastAt.slice(0, 10))}</Text>
        </View>
      </View>
    </Card>
  );
}

// GET /api/conversations is identity-aware: staff (bookkeeper/admin) get
// every conversation across every client, a client account gets only
// their own — see src/app/api/conversations/route.ts (same pattern as
// Exceptions). `clientId` narrows to one client's thread when reached
// from that client's detail screen — filtered client-side, since the
// backend route has no such query param (see services/conversations.ts).
export default function ConversationsScreen() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const { clientId: paramClientId } = useLocalSearchParams<{ clientId?: string }>();
  const { activeClient, clearActiveClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["conversations", clientId ?? "all"],
    queryFn: () => getConversations(clientId),
    // Lightweight polling so a new client/bookkeeper reply shows up without
    // a manual pull-to-refresh — there's no push-notification pipeline for
    // messages in the backend (see the audit note in the final report), so
    // this is the safe, additive way to approximate "receive replies"
    // without adding new infrastructure.
    refetchInterval: 20000,
  });

  const sorted = [...(data ?? [])].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  // "Client: X" indicator — same pattern as the other client-scoped
  // screens, shown only when a bookkeeper narrowed to one client's thread.
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: isStaff && !!clientId });
  const selectedClient = clientId ? clientsQuery.data?.find((c) => c.id === clientId) : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Messages", headerStyle: { backgroundColor: colors.surface } }} />
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
        <ErrorState message={error instanceof ApiError ? error.message : "Could not load conversations."} onRetry={() => refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState title="No messages" subtitle={isStaff ? "Client conversations will show up here." : "Messages with your bookkeeper will show up here."} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              showClient={isStaff}
              unread={isStaff ? item.unreadByAccountant : item.unreadByUser}
              onPress={() => router.push(`/conversations/${item.id}`)}
            />
          )}
          refreshing={isRefetching}
          onRefresh={refetch}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

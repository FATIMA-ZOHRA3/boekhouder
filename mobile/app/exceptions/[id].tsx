import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, ErrorState, Input, PrimaryButton, SkeletonDetail, StatusBadge } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getExceptions, respondToException } from "@/services/exceptions";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";

// There's no GET /api/exceptions/[id] (only the list route and PATCH —
// see src/app/api/exceptions/[id]/route.ts), so this resolves the single
// item from the cached "exceptions" list, same pattern as the Client
// detail screen.
export default function ExceptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [response, setResponse] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: loadError, refetch } = useQuery({ queryKey: ["exceptions"], queryFn: () => getExceptions() });
  const item = data?.find((e) => e.id === id);

  // The backend only lets the exception's own owner respond (see
  // src/app/api/exceptions/[id]/respond/route.ts's `item.userId !==
  // session.userId` check) — a staff viewer sees the read-only view below
  // regardless of what they type, since submitting would just 403.
  const canRespond = item && profile?.id === item.userId && item.status !== "resolved";

  const submit = async () => {
    if (!item || !response.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await respondToException(item.id, response.trim(), notes.trim() || undefined);
      queryClient.invalidateQueries({ queryKey: ["exceptions"] });
      setResponse("");
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your response.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <SkeletonDetail />;
  if (isError || !item) {
    return <ErrorState message={loadError instanceof ApiError ? loadError.message : "This exception could not be found."} onRetry={() => refetch()} />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Exception", headerStyle: { backgroundColor: colors.surface } }} />

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm }}>
          <Text style={[typography.h2, { flex: 1, marginRight: spacing.md }]}>{item.title}</Text>
          <StatusBadge label={item.status} tone={item.status === "resolved" ? "success" : "warning"} />
        </View>
        {item.user.id !== profile?.id ? <Text style={[typography.caption, { marginBottom: spacing.sm }]}>{item.user.company || item.user.name}</Text> : null}
        <Text style={typography.body}>{item.description}</Text>
        <Text style={[typography.caption, { marginTop: spacing.md }]}>Raised {formatDate(item.createdAt.slice(0, 10))} by {item.createdBy.name}</Text>
      </Card>

      {item.customerResponse ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Response</Text>
          <Text style={typography.body}>{item.customerResponse}</Text>
          {item.customerNotes ? <Text style={[typography.bodyMuted, { marginTop: spacing.sm }]}>{item.customerNotes}</Text> : null}
        </Card>
      ) : null}

      {canRespond ? (
        <Card>
          <Text style={[typography.h3, { marginBottom: spacing.md }]}>Your response</Text>
          <Input placeholder="Explain or answer this exception" value={response} onChangeText={setResponse} multiline style={{ minHeight: 90, marginBottom: spacing.md }} />
          <Input placeholder="Extra notes (optional)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 60, marginBottom: spacing.md }} />
          {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}
          <PrimaryButton title="Send response" onPress={submit} loading={submitting} disabled={!response.trim()} />
        </Card>
      ) : null}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

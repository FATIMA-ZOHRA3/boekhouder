import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, ErrorState, Input, PrimaryButton, SkeletonDetail } from "@/components/ui";
import { colors, spacing, typography, radius } from "@/constants/theme";
import { getConversation, sendMessage } from "@/services/conversations";
import { draftReply, summarizeConversation, summarizeTask } from "@/services/ai";
import { createTask } from "@/services/tasks";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import type { ConversationMessage, ConversationSummary, DraftReplyResult, TaskSummary } from "@/types/api";

function MessageBubble({
  message,
  mine,
  onCreateTask,
}: {
  message: ConversationMessage;
  mine: boolean;
  onCreateTask?: () => void;
}) {
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", marginBottom: spacing.md }}>
      <View
        style={{
          maxWidth: "82%",
          backgroundColor: mine ? colors.brandPrimary : colors.surface,
          borderWidth: mine ? 0 : StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Text style={{ color: mine ? colors.textOnPrimary : colors.textPrimary, fontSize: 15 }}>{message.text}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 }}>
        <Text style={typography.caption}>
          {new Date(message.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </Text>
        {!mine && onCreateTask ? (
          <Text onPress={onCreateTask} style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
            Create task from this
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// Staff-only card proposing a task from a customer message — the AI
// ("summarize-task") only proposes title/description; nothing is created
// until the bookkeeper taps "Create task" (POST /api/tasks).
function TaskProposalCard({
  proposal,
  userId,
  conversationId,
  onDone,
  onCancel,
}: {
  proposal: TaskSummary;
  userId: string;
  conversationId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [description, setDescription] = useState(proposal.description);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        date: new Date().toISOString().slice(0, 10),
        userId,
        conversationId,
        sourceType: "conversation",
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not create the task. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ marginBottom: spacing.lg, borderColor: colors.primary }}>
      <Text style={[typography.h3, { marginBottom: spacing.sm }]}>AI-suggested task</Text>
      <Text style={[typography.caption, { marginBottom: spacing.md }]}>Review and edit before creating it.</Text>
      <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Title</Text>
      <Input value={title} onChangeText={setTitle} style={{ marginBottom: spacing.md }} />
      <Text style={[typography.caption, { marginBottom: spacing.xs }]}>Description</Text>
      <Input value={description} onChangeText={setDescription} multiline style={{ marginBottom: spacing.md, minHeight: 70, textAlignVertical: "top" }} />
      {err ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{err}</Text> : null}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="Cancel" onPress={onCancel} disabled={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="Create task" onPress={save} loading={saving} />
        </View>
      </View>
    </Card>
  );
}

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();

  const { data: conversation, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => getConversation(id),
    enabled: !!id,
    // Same lightweight polling as the conversation list — see the note
    // there. Every fetch also flips the unread flag server-side (see
    // GET /api/conversations/[id]), so this keeps the thread reasonably
    // live without a push pipeline.
    refetchInterval: 15000,
  });

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Draft Reply — "AI proposes, bookkeeper reviews/edits, bookkeeper sends".
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<DraftReplyResult | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Summarize Conversation.
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Summarize Task, triggered per customer message.
  const [taskSourceMessageId, setTaskSourceMessageId] = useState<string | null>(null);
  const [taskProposing, setTaskProposing] = useState(false);
  const [taskProposal, setTaskProposal] = useState<TaskSummary | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  if (isLoading) return <SkeletonDetail />;
  if (isError || !conversation) {
    return <ErrorState message={error instanceof ApiError ? error.message : "Could not load this conversation."} onRetry={() => refetch()} />;
  }

  const runDraftReply = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const result = await draftReply(conversation.id);
      setDraft(result);
      setMessageText(result.draft);
    } catch (e) {
      setDraftError(e instanceof ApiError ? e.message : "Could not generate a draft. Try again.");
    } finally {
      setDrafting(false);
    }
  };

  const runSummarize = async () => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      setSummary(await summarizeConversation(conversation.id));
    } catch (e) {
      setSummaryError(e instanceof ApiError ? e.message : "Could not summarize this conversation. Try again.");
    } finally {
      setSummarizing(false);
    }
  };

  const runCreateTaskFrom = async (message: ConversationMessage) => {
    setTaskSourceMessageId(message.id);
    setTaskProposing(true);
    setTaskError(null);
    setTaskProposal(null);
    try {
      setTaskProposal(await summarizeTask({ messageText: message.text, customerName: conversation.user.company || conversation.user.name }));
    } catch (e) {
      setTaskError(e instanceof ApiError ? e.message : "Could not generate a task suggestion. Try again.");
    } finally {
      setTaskProposing(false);
    }
  };

  const send = async () => {
    if (!messageText.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await sendMessage(conversation.id, messageText.trim());
      setMessageText("");
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ["conversation", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : "Could not send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: conversation.subject, headerStyle: { backgroundColor: colors.surface } }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }} style={{ backgroundColor: colors.background }}>
        {isStaff ? (
          <Text style={[typography.bodyMuted, { marginBottom: spacing.md }]}>
            {conversation.user.company || conversation.user.name}
          </Text>
        ) : null}

        {isStaff ? (
          <View style={{ marginBottom: spacing.lg }}>
            <PrimaryButton title="Summarize conversation" onPress={runSummarize} loading={summarizing} />
          </View>
        ) : null}

        {summaryError ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{summaryError}</Text> : null}
        {summary ? (
          <Card style={{ marginBottom: spacing.lg, borderColor: colors.primary }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
              <Text style={typography.h3}>Summary</Text>
              <Text onPress={() => setSummary(null)} style={{ color: colors.textMuted }}>✕</Text>
            </View>
            <Text style={typography.body}>{summary.summary}</Text>
            {summary.openQuestion ? (
              <Text style={[typography.bodyMuted, { marginTop: spacing.sm }]}>Open: {summary.openQuestion}</Text>
            ) : null}
          </Card>
        ) : null}

        {(conversation.messages ?? []).map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            mine={isStaff ? m.senderRole === "bookkeeper" : m.senderRole === "client"}
            onCreateTask={isStaff && m.senderRole === "client" ? () => runCreateTaskFrom(m) : undefined}
          />
        ))}

        {taskSourceMessageId ? (
          taskProposing ? (
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={typography.bodyMuted}>Generating task suggestion…</Text>
            </Card>
          ) : taskError ? (
            <Card style={{ marginBottom: spacing.lg }}>
              <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{taskError}</Text>
              <PrimaryButton
                title="Dismiss"
                onPress={() => {
                  setTaskSourceMessageId(null);
                  setTaskError(null);
                }}
              />
            </Card>
          ) : taskProposal ? (
            <TaskProposalCard
              proposal={taskProposal}
              userId={conversation.userId}
              conversationId={conversation.id}
              onCancel={() => {
                setTaskSourceMessageId(null);
                setTaskProposal(null);
              }}
              onDone={() => {
                setTaskSourceMessageId(null);
                setTaskProposal(null);
                queryClient.invalidateQueries({ queryKey: ["tasks"] });
              }}
            />
          ) : null
        ) : null}
      </ScrollView>

      <View style={{ padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface }}>
        {draftError ? <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{draftError}</Text> : null}
        {draft ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm }}>
            <Text style={typography.caption}>AI draft below — edit freely before sending.</Text>
            <Text onPress={runDraftReply} style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
              Regenerate
            </Text>
          </View>
        ) : null}
        {sendError ? <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>{sendError}</Text> : null}
        <Input
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Write a message…"
          multiline
          style={{ marginBottom: spacing.sm, minHeight: 44, maxHeight: 120, textAlignVertical: "top" }}
        />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          {isStaff ? (
            <View style={{ flex: 1 }}>
              <PrimaryButton title={draft ? "Cancel draft" : "Suggest reply"} onPress={draft ? () => { setDraft(null); setMessageText(""); } : runDraftReply} loading={drafting} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Send" onPress={send} loading={sending} disabled={!messageText.trim()} />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

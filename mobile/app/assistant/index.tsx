import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card, Input } from "@/components/ui";
import { colors, radius, spacing, typography, shadow } from "@/constants/theme";
import { askAssistant } from "@/services/ai";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import type { ChatMessage } from "@/types/api";

// LayoutAnimation needs an explicit opt-in on Android (iOS supports it by
// default); harmless no-op on the New Architecture, which animates layout
// changes natively regardless.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// StyleSheet.hairlineWidth isn't worth importing StyleSheet just for this
// one border — inline constant keeps the import list minimal.
const HAIRLINE = Platform.OS === "ios" ? 0.5 : 1;

// ─────────────────────────────────────────────────────────────────────────
// Suggested questions
// ─────────────────────────────────────────────────────────────────────────
// Bank data is only ever loaded server-side for staff callers (bank.read is
// staff-only — see the route's own comments), so a client tapping a "Bank
// activity" suggestion would always get "I don't have access to that".
// Rather than show a suggestion that's guaranteed to disappoint, the 4th
// card is role-aware: staff see bank activity, clients see "who owes me"
// (backed by their own invoice data instead).
type Suggestion = { emoji: string; label: string; question: string };

const CORE_SUGGESTIONS: Suggestion[] = [
  { emoji: "🧾", label: "Overdue invoices", question: "What invoices are overdue?" },
  { emoji: "💰", label: "Financial summary", question: "Give me a financial summary" },
  { emoji: "🛒", label: "Recent purchases", question: "What are my recent purchases?" },
];
const STAFF_SUGGESTION: Suggestion = { emoji: "🏦", label: "Bank activity", question: "Show me my recent bank activity." };
const CLIENT_SUGGESTION: Suggestion = { emoji: "👥", label: "Who owes me", question: "Which customers owe money?" };

// ─────────────────────────────────────────────────────────────────────────
// Lightweight, display-only parsing of the backend's plain-text answer
// ─────────────────────────────────────────────────────────────────────────
// The backend computes every number deterministically server-side and folds
// it into the prose answer (see the route's system prompt — the model is
// explicitly told never to guess a figure). These helpers never compute or
// invent anything themselves; they just lift a number already present in
// the text into a small visual chip, and suggest a relevant screen to jump
// to. If nothing matches, nothing renders — the plain bubble is always the
// fallback.
function extractAmountChip(text: string): string | null {
  const match = text.match(/€\s?-?[\d.,]+(?:[.,]\d{2})?/);
  return match ? match[0].trim() : null;
}
function extractCountChip(text: string): string | null {
  const match = text.match(/\b\d+\s+(overdue\s+)?(invoices?|purchases?|transactions?|customers?|payments?)\b/i);
  if (!match) return null;
  return match[0].charAt(0).toUpperCase() + match[0].slice(1);
}
type QuickLink = { label: string; href: "/(tabs)/invoices" | "/(tabs)/purchases" | "/bank" | "/customers"; icon: keyof typeof Ionicons.glyphMap };
function relatedAction(exchangeText: string, isStaff: boolean): QuickLink | null {
  const t = exchangeText.toLowerCase();
  if (/\binvoice/.test(t)) return { label: "View invoices", href: "/(tabs)/invoices", icon: "document-text-outline" };
  if (/\bpurchase/.test(t)) return { label: "View purchases", href: "/(tabs)/purchases", icon: "cart-outline" };
  if (isStaff && /\bbank\b/.test(t)) return { label: "View bank activity", href: "/bank", icon: "business-outline" };
  if (/\bcustomer/.test(t)) return { label: "View customers", href: "/customers", icon: "people-outline" };
  return null;
}
function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Header — custom (not the native Stack header) so it can carry the AI
// avatar + subtitle the design calls for, not just a plain title.
// ─────────────────────────────────────────────────────────────────────────
function AssistantHeader() {
  const router = useRouter();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        backgroundColor: colors.surface,
        borderBottomWidth: HAIRLINE,
        borderBottomColor: colors.border,
        gap: spacing.md,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -spacing.xs }}
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: colors.brandPrimary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="sparkles" size={20} color={colors.textOnPrimary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={typography.h3}>AI Assistant</Text>
        <Text style={typography.caption}>Your financial copilot</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Empty state — welcome hero + suggestion grid
// ─────────────────────────────────────────────────────────────────────────
function WelcomeHero({ suggestions, onPick }: { suggestions: Suggestion[]; onPick: (q: string) => void }) {
  return (
    <View style={{ flex: 1, padding: spacing.lg, justifyContent: "center" }}>
      <View style={{ alignItems: "center", marginBottom: spacing.xl }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.primaryLight,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.lg,
          }}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.brandPrimary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="sparkles" size={26} color={colors.textOnPrimary} />
          </View>
        </View>
        <Text style={[typography.h2, { textAlign: "center" }]}>Ask about your books</Text>
        <Text style={[typography.bodyMuted, { textAlign: "center", marginTop: spacing.xs, paddingHorizontal: spacing.lg }]}>
          I can answer questions about your real invoices, purchases and balances. I can&apos;t create, edit or send
          anything.
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "space-between" }}>
        {suggestions.map((s) => (
          <Pressable
            key={s.label}
            onPress={() => onPick(s.question)}
            accessibilityRole="button"
            accessibilityLabel={s.label}
            accessibilityHint={`Asks: ${s.question}`}
            style={({ pressed }) => [{ width: "47%" }, pressed && { opacity: 0.85 }]}
          >
            <Card style={{ alignItems: "flex-start", gap: spacing.sm, minHeight: 92, justifyContent: "center" }}>
              <Text style={{ fontSize: 22 }}>{s.emoji}</Text>
              <Text style={[typography.body, { fontWeight: "600" }]}>{s.label}</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: spacing.xl, gap: spacing.xs }}>
        <Ionicons name="mic-outline" size={14} color={colors.textMuted} />
        <Text style={typography.caption}>Tip: tap the mic on your keyboard to dictate a question</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Chat bubbles
// ─────────────────────────────────────────────────────────────────────────
function Bubble({
  message,
  precedingQuestion,
  isStaff,
  onRetry,
}: {
  message: ChatMessage;
  precedingQuestion: string;
  isStaff: boolean;
  onRetry: () => void;
}) {
  const isUser = message.role === "user";
  const amountChip = !isUser && !message.failed ? extractAmountChip(message.content) : null;
  const countChip = !isUser && !message.failed ? extractCountChip(message.content) : null;
  const action = !isUser && !message.failed ? relatedAction(`${precedingQuestion} ${message.content}`, isStaff) : null;
  const router = useRouter();

  return (
    <View style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "85%", marginBottom: spacing.md }}>
      {!isUser ? (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 6 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="sparkles" size={10} color={colors.textOnPrimary} />
          </View>
          <Text style={typography.caption}>Assistant</Text>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: message.failed ? colors.dangerLight : isUser ? colors.brandPrimary : colors.surface,
          borderRadius: radius.lg,
          borderTopRightRadius: isUser ? radius.sm : radius.lg,
          borderTopLeftRadius: isUser ? radius.lg : radius.sm,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.md,
          borderWidth: isUser ? 0 : HAIRLINE,
          borderColor: message.failed ? colors.danger : colors.border,
          ...(isUser ? {} : shadow.card),
        }}
      >
        {(amountChip || countChip) && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.xs }}>
            {amountChip ? (
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 }}>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{amountChip}</Text>
              </View>
            ) : null}
            {countChip ? (
              <View style={{ backgroundColor: colors.background, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3, borderWidth: HAIRLINE, borderColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>{countChip}</Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={{ ...typography.body, color: isUser ? colors.textOnPrimary : colors.textPrimary }}>{message.content}</Text>

        {action ? (
          <Pressable
            onPress={() => router.push(action.href)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={action.label}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm, paddingVertical: 4, alignSelf: "flex-start" }}
          >
            <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{action.label}</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 3, alignSelf: isUser ? "flex-end" : "flex-start" }}>
        {message.createdAt ? <Text style={typography.caption}>{formatTime(message.createdAt)}</Text> : null}
        {message.failed ? (
          <Pressable
            onPress={onRetry}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Message failed to send. Tap to retry."
          >
            <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>Failed · Tap to retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function TypingIndicator() {
  // useState (not useRef) so the Animated.Value can be safely read during
  // render below — a plain ref's `.current` shouldn't be dereferenced at
  // render time, only in effects/handlers. The lazy initializer still
  // guarantees exactly one Animated.Value for this component's lifetime.
  const [pulse] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 450, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ alignSelf: "flex-start", marginBottom: spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          gap: 4,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderTopLeftRadius: radius.sm,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.md,
          borderWidth: HAIRLINE,
          borderColor: colors.border,
          ...shadow.card,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.textMuted,
              opacity: pulse,
              // Slight stagger per dot so they don't pulse in lockstep.
              transform: [{ scale: pulse.interpolate({ inputRange: [0.3, 1], outputRange: [0.8 + i * 0.02, 1] }) }],
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────
export default function AssistantScreen() {
  const { isStaff } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const suggestions: Suggestion[] = [...CORE_SUGGESTIONS, isStaff ? STAFF_SUGGESTION : CLIENT_SUGGESTION];

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Smooth insertion/removal instead of messages just snapping into place —
  // covers new bubbles, the typing indicator appearing/disappearing, and a
  // failed message being removed on retry.
  const animateNext = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, []);

  const send = useCallback(
    async (questionText: string) => {
      const text = questionText.trim();
      if (!text || sending) return;

      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() };
      animateNext();
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);
      scrollToEnd();

      // Trailing context only — the backend re-fetches all real data fresh
      // on every call, this is just for conversational follow-ups like
      // "and last month?".
      const history = messages
        .filter((m) => !m.failed)
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const result = await askAssistant(text, history);
        animateNext();
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", content: result.answer, createdAt: new Date().toISOString() },
        ]);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Connection lost. Please check your internet connection and try again.";
        animateNext();
        setMessages((prev) => [
          ...prev,
          { id: `a-err-${Date.now()}`, role: "assistant", content: message, failed: true, createdAt: new Date().toISOString() },
        ]);
      } finally {
        setSending(false);
        scrollToEnd();
      }
    },
    [messages, sending, scrollToEnd, animateNext]
  );

  const retry = useCallback(
    (failedMessage: ChatMessage) => {
      // Find the user question right before this failed reply and resend it.
      animateNext();
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === failedMessage.id);
        const lastUser = [...prev.slice(0, idx)].reverse().find((m) => m.role === "user");
        if (lastUser) send(lastUser.content);
        return prev.filter((m) => m.id !== failedMessage.id);
      });
    },
    [send, animateNext]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AssistantHeader />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messages.length === 0 ? (
          <WelcomeHero suggestions={suggestions} onPick={send} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item, index }) => (
              <Bubble
                message={item}
                precedingQuestion={index > 0 && messages[index - 1].role === "user" ? messages[index - 1].content : ""}
                isStaff={isStaff}
                onRetry={() => retry(item)}
              />
            )}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.sm, flexGrow: 1 }}
            ListFooterComponent={sending ? <TypingIndicator /> : null}
            showsVerticalScrollIndicator={false}
          />
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: spacing.md,
            borderTopWidth: HAIRLINE,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
            gap: spacing.sm,
          }}
        >
          <Input
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question, or tap the mic…"
            accessibilityLabel="Message the AI assistant"
            style={{ flex: 1, borderRadius: radius.pill, backgroundColor: colors.background }}
            editable={!sending}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            accessibilityRole="button"
            accessibilityLabel={sending ? "Sending message" : "Send message"}
            accessibilityState={{ disabled: sending || !input.trim() }}
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.pill,
              backgroundColor: sending || !input.trim() ? colors.border : colors.brandPrimary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {sending ? (
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textOnPrimary} />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.textOnPrimary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

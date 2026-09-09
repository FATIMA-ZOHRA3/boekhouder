import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { Card, ErrorState, Input, PrimaryButton, Screen, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getCustomers, createCustomer } from "@/services/customers";
import { createInvoice } from "@/services/invoices";
import { parseVoiceInvoiceItem } from "@/services/ai";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import type { Customer, Invoice, InvoiceDraft, InvoiceLineDraft } from "@/types/api";

// ═══════════════════════════════════════════════════════════════════════════
// Voice Invoice — Client → Invoices → Create Invoice → Voice
//
// SOURCE OF TRUTH: src/components/VoiceInvoiceAssistant.tsx (web), used from
// src/app/client/invoices/new/page.tsx. Read in full before changing this
// file. What it actually does, confirmed by reading it:
//   - Speech-to-text happens ENTIRELY client-side, via the browser's own
//     `window.SpeechRecognition` / `window.webkitSpeechRecognition` (Web
//     Speech API) — no audio is ever uploaded anywhere. Text-to-speech
//     (reading prompts back) similarly uses `window.speechSynthesis`.
//   - The ONLY backend AI call in the entire flow is
//     POST /api/ai/voice-invoice/parse-item — used exclusively for turning
//     one sentence about line items into structured {description, quantity,
//     unitPrice, vatRate}. Customer matching, dates, and totals are all
//     plain deterministic logic in that component (see lib/customerMatch.ts
//     on the web side) — never sent through the AI.
//   - There is no separate "/api/ai/voice-invoice" audio/transcription
//     endpoint. This mobile screen does not invent one (per the phase
//     instructions: reuse exactly what exists, never duplicate backend
//     logic) — it calls the identical parse-item endpoint, with the same
//     request/response shape, for the same one purpose.
//
// MOBILE ADAPTATION (and why): Expo Go has no equivalent of the browser's
// SpeechRecognition on iOS/Android — that would require a native module and
// a custom dev client, which every phase of this project has deliberately
// avoided adding. This screen instead:
//   - On Expo WEB, uses the real, same `window.SpeechRecognition` API the
//     web app uses — genuine tap-to-talk, live transcription, no mobile
//     workaround at all on that platform.
//   - On iOS/Android, falls back to the device keyboard's own built-in
//     dictation (the mic key every iOS/Android keyboard already has) typing
//     into a plain text field, inside the same big-button
//     idle/recording/processing staging the spec asks for. This is a
//     genuine platform limitation, not a shortcut — flagged again in the
//     phase report.
// Customer selection/creation reuses the existing /api/customers endpoints
// (GET + POST) exactly as the web version does. Invoice creation reuses the
// existing POST /api/invoices exactly as a manually-typed invoice would.
//
// SPOKEN QUESTIONS (this revision): the web assistant's ask()/say() pattern —
// speak the current question out loud AND keep it written on screen, then
// accept either a spoken or a typed answer — is now mirrored here for every
// step, not just item capture. `expo-speech` is a standard Expo SDK module
// (works in Expo Go on iOS/Android/web, no native config or dev client
// needed — unlike a speech-to-text module, this adds no native dependency
// footprint), used purely for text-to-speech. It never replaces the on-screen
// question text; `useSpeakQuestion` below always renders the same string it
// speaks, with a "Repeat" button, so a client who can't or doesn't want audio
// still gets the full question in writing. Answering by voice still uses the
// same two mechanisms as before per platform (Web Speech API on Expo Web,
// keyboard dictation on iOS/Android) — no new STT dependency is introduced.
// ═══════════════════════════════════════════════════════════════════════════

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Same deterministic due-date rule as the web assistant's calculateDueDate —
// a customer's own payment term when set, otherwise 30 days. Never touches
// the AI: this is exactly the "dates are deterministic, not AI" split the
// web component documents in its own header comment.
function computeDueDate(date: string, termValue?: number | null, termUnit?: string | null): string {
  const d = new Date(date);
  const value = termValue ?? 30;
  const unit = termUnit ?? "days";
  if (unit === "months") d.setMonth(d.getMonth() + value);
  else if (unit === "weeks") d.setDate(d.getDate() + value * 7);
  else d.setDate(d.getDate() + value);
  return d.toISOString().slice(0, 10);
}

function newLineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyDraft(): InvoiceDraft {
  return {
    customerId: null,
    customerName: "",
    customerAddress: "",
    date: todayIso(),
    dueDate: computeDueDate(todayIso()),
    notes: "",
    items: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Web Speech API bridge — ONLY active when Platform.OS === "web" and the
// browser actually exposes it (same feature-detection the web app itself
// does: `!!(window.SpeechRecognition || window.webkitSpeechRecognition)`).
// This is not a mobile reimplementation of anything — it's the identical
// browser API, used the identical way, so Expo Web genuinely matches the
// web app's real mechanism rather than approximating it.
// ─────────────────────────────────────────────────────────────────────────
type WebSpeech = {
  supported: boolean;
  start: (onResult: (text: string) => void, onError: () => void, onEnd: () => void) => void;
  stop: () => void;
};

function useWebSpeech(): WebSpeech {
  const recognitionRef = useRef<any>(null);

  if (Platform.OS !== "web" || typeof window === "undefined") {
    return { supported: false, start: () => {}, stop: () => {} };
  }
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) {
    return { supported: false, start: () => {}, stop: () => {} };
  }

  return {
    supported: true,
    start: (onResult, onError, onEnd) => {
      const recognition = new Ctor();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event: any) => {
        const text = event.results?.[0]?.[0]?.transcript || "";
        onResult(text);
      };
      recognition.onerror = () => onError();
      recognition.onend = () => onEnd();
      recognitionRef.current = recognition;
      recognition.start();
    },
    stop: () => {
      recognitionRef.current?.stop();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Speaks the assistant's current question aloud via expo-speech whenever it
// changes, and exposes a manual "repeat" action for the same text. The
// caller is always responsible for also rendering `question` on screen —
// this hook only ever adds the audio; it is never the only place the
// question exists, per the spec's "must also be written" requirement.
// ─────────────────────────────────────────────────────────────────────────
function useSpeakQuestion(question: string | null) {
  const [speaking, setSpeaking] = useState(false);

  const speakNow = (text: string) => {
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      language: "en-US",
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  useEffect(() => {
    if (!question) return;
    speakNow(question);
    return () => {
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  return { speaking, repeat: () => question && speakNow(question) };
}

// ─────────────────────────────────────────────────────────────────────────
// Written question banner — the on-screen counterpart to useSpeakQuestion.
// Always shows the exact text being spoken, plus a button to hear it again.
// ─────────────────────────────────────────────────────────────────────────
function AssistantQuestion({ text, speaking, onRepeat }: { text: string; speaking: boolean; onRepeat: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: colors.surfaceAlt,
        borderRadius: 12,
        padding: spacing.md,
        marginBottom: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { fontWeight: "600" }]}>{text}</Text>
        {speaking ? <Text style={[typography.caption, { marginTop: spacing.xs }]}>🔊 Speaking…</Text> : null}
      </View>
      <Pressable onPress={onRepeat} accessibilityRole="button" accessibilityLabel="Repeat question" hitSlop={8}>
        <Ionicons name="volume-high-outline" size={20} color={colors.primary} />
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Big mic button + elapsed timer, shared by the "idle"/"recording" visuals.
// ─────────────────────────────────────────────────────────────────────────
function MicButton({ phase, onPress }: { phase: "idle" | "recording" | "processing"; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (phase !== "recording") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  return (
    <Pressable onPress={onPress} disabled={phase === "processing"} accessibilityRole="button" accessibilityLabel="Voice input">
      <Animated.View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: phase === "recording" ? colors.danger : colors.brandPrimary,
          transform: [{ scale: pulse }],
          opacity: phase === "processing" ? 0.5 : 1,
        }}
      >
        <Ionicons name={phase === "recording" ? "stop" : "mic"} size={34} color={colors.textOnPrimary} />
      </Animated.View>
    </Pressable>
  );
}

function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return seconds;
}
function formatElapsed(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────
type Stage = "collect" | "review" | "creating" | "success" | "error";
type MicPhase = "idle" | "recording" | "processing";

export default function VoiceInvoiceScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isStaff } = useAuth();
  const webSpeech = useWebSpeech();

  // Client-only ("ai.voice-invoice.use" is not in STAFF_PERMISSIONS — see
  // the phase-1 permission audit). The web app never offers this to a
  // bookkeeper either (VoiceInvoiceAssistant is only mounted from the
  // client portal's /client/invoices/new), so this is a faithful match,
  // not an invented restriction.
  useEffect(() => {
    if (isStaff) router.replace("/");
  }, [isStaff, router]);

  const [stage, setStage] = useState<Stage>("collect");
  const [draft, setDraft] = useState<InvoiceDraft>(() => emptyDraft());
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);
  // Belt-and-suspenders against a double "Create Invoice" tap (spec test
  // case 7): the button is already disabled once stage !== "review", but a
  // ref survives even a rapid double-press within the same render tick.
  const submittingRef = useRef(false);

  // --- Step 1: customer -----------------------------------------------------
  const { data: customers, isLoading: loadingCustomers, isError: customersError, refetch: refetchCustomers } = useQuery({
    queryKey: ["customers", "own"],
    queryFn: () => getCustomers(),
    enabled: !isStaff,
  });
  const [customerQuery, setCustomerQuery] = useState("");
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers ?? [];
    return (customers ?? []).filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, customerQuery]);

  const selectCustomer = (c: Customer) => {
    setDraft((d) => ({
      ...d,
      customerId: c.id,
      customerName: c.name,
      customerAddress: c.address || "",
      dueDate: computeDueDate(d.date, c.paymentTermValue, c.paymentTermUnit),
    }));
    setNewCustomerMode(false);
    setCustomerError(null);
  };

  // Answering the customer question by voice: same Web Speech API bridge as
  // item capture, reused rather than duplicated. On iOS/Android (no Web
  // Speech API), this button is simply not shown — the keyboard's own mic
  // key on the text input below is the answer channel there, as it already
  // is for item capture.
  const [listeningCustomer, setListeningCustomer] = useState(false);
  const answerCustomerByVoice = () => {
    if (!webSpeech.supported || listeningCustomer) return;
    setListeningCustomer(true);
    webSpeech.start(
      (text) => {
        setListeningCustomer(false);
        if (text.trim()) setCustomerQuery(text.trim());
      },
      () => setListeningCustomer(false),
      () => setListeningCustomer(false)
    );
  };

  const confirmNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      setCustomerError("Enter a customer name.");
      return;
    }
    setCreatingCustomer(true);
    setCustomerError(null);
    try {
      const created = await createCustomer({ name: newCustomerName.trim() });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      selectCustomer(created);
    } catch (e) {
      setCustomerError(e instanceof ApiError ? e.message : "Could not create the customer. Try again.");
    } finally {
      setCreatingCustomer(false);
    }
  };

  // --- Step 2: items, captured by voice (or typed) ---------------------------
  const [micPhase, setMicPhase] = useState<MicPhase>("idle");
  const [utterance, setUtterance] = useState("");
  const [lastConfirmation, setLastConfirmation] = useState<string | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const elapsed = useElapsedSeconds(micPhase === "recording");

  const runParse = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setMicPhase("idle");
      return;
    }
    setMicPhase("processing");
    setParseError(null);
    try {
      const result = await parseVoiceInvoiceItem({
        utterance: trimmed,
        existingItems: draft.items.map(({ description, quantity, unitPrice, vatRate }) => ({
          description,
          quantity,
          unitPrice,
          vatRate,
        })),
        defaultVatRate: 21,
      });
      setDraft((d) => ({ ...d, items: result.items.map((it) => ({ ...it, key: newLineKey() })) }));
      setLastConfirmation(result.spoken_confirmation || null);
      setClarification(result.clarification_needed || null);
      setUtterance("");
    } catch (e) {
      // STEP 13 diagnostics: a real backend error (400/422/500 with a
      // message) is shown as-is rather than flattened into "Connection
      // lost" — that generic message is reserved for an actual network
      // failure (ApiError.status === 0, see services/api.ts).
      if (e instanceof ApiError) {
        setParseError(e.status === 0 ? e.message : `${e.message}${e.status ? ` (${e.status})` : ""}`);
      } else {
        setParseError("Could not understand that. Try rephrasing.");
      }
    } finally {
      setMicPhase("idle");
    }
  };

  const onMicPress = () => {
    if (micPhase === "processing") return;
    if (webSpeech.supported) {
      if (micPhase === "recording") {
        webSpeech.stop();
        return;
      }
      setParseError(null);
      setMicPhase("recording");
      webSpeech.start(
        (text) => runParse(text),
        () => {
          setMicPhase("idle");
          setParseError("Didn't catch that — try again, or type it below.");
        },
        () => setMicPhase((p) => (p === "recording" ? "idle" : p))
      );
    } else {
      // No Web Speech API on this platform (iOS/Android in Expo Go): the
      // "recording" phase becomes "type it, using your keyboard's mic key
      // if you like" — same visual staging, honest about the mechanism.
      setMicPhase((p) => (p === "recording" ? "idle" : "recording"));
    }
  };

  const removeLine = (key: string) => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== key) }));
  const updateLine = (key: string, patch: Partial<InvoiceLineDraft>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const addBlankLine = () =>
    setDraft((d) => ({ ...d, items: [...d.items, { key: newLineKey(), description: "", quantity: 1, unitPrice: 0, vatRate: 21 }] }));

  const subtotal = draft.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatTotal = draft.items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.vatRate / 100), 0);
  const total = subtotal + vatTotal;

  // STEP 8 validation — mirrors the web form's minimum requirements before
  // POST /api/invoices is ever called: a real customer, at least one line
  // with a non-empty description, a positive quantity, a non-negative
  // price, and both dates present. Never submits straight from raw AI
  // output without this check, even if every AI-produced line already
  // happens to satisfy it.
  const validationError = useMemo(() => {
    if (!draft.customerId && !draft.customerName.trim()) return "Choose or create a customer first.";
    if (draft.items.length === 0) return "Add at least one line item.";
    for (const item of draft.items) {
      if (!item.description.trim()) return "Every line needs a description.";
      if (!(item.quantity > 0)) return "Quantity must be greater than 0.";
      if (item.unitPrice < 0) return "Unit price can't be negative.";
      if (item.vatRate < 0 || item.vatRate > 100) return "VAT rate must be between 0 and 100.";
    }
    if (!draft.date || !draft.dueDate) return "Invoice date and due date are required.";
    return null;
  }, [draft]);

  const goToReview = () => {
    setParseError(null);
    setStage("review");
  };

  const createTheInvoice = async () => {
    if (submittingRef.current) return; // STEP 17 case 7: double-tap guard
    if (validationError) return;
    submittingRef.current = true;
    setStage("creating");
    setErrorMessage("");
    try {
      const invoice = await createInvoice({
        customerId: draft.customerId,
        customerName: draft.customerName,
        customerAddress: draft.customerAddress,
        date: draft.date,
        dueDate: draft.dueDate,
        items: draft.items.map(({ description, quantity, unitPrice, vatRate }) => ({ description, quantity, unitPrice, vatRate })),
        notes: draft.notes.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setCreatedInvoice(invoice);
      setStage("success");
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.status === 0
            ? e.message
            : `${e.message}${e.status ? ` (${e.status})` : ""}`
          : "Could not create the invoice. Try again.";
      setErrorMessage(message);
      setStage("error");
    } finally {
      submittingRef.current = false;
    }
  };

  // ── The assistant's current question — spoken AND written ───────────────
  // Exactly one of these is true at a time, matching the two sequential
  // steps already on screen (customer, then items); the wording mirrors the
  // step headers below so the spoken and written forms never disagree.
  // IMPORTANT: this hook (and every hook) must run on every render of this
  // component, unconditionally — it's declared here, before the isStaff/
  // success/error early returns below, precisely so those returns never
  // skip it. A previous revision placed this right before the COLLECT
  // stage's `return`, after those early returns — on any render that took
  // one of those returns (isStaff, success, error), this hook simply never
  // ran, so React saw a different number of hooks between renders and threw
  // "Rendered fewer hooks than expected". Its VALUE is only used in the
  // COLLECT-stage JSX further down; it's positioned here purely for hook
  // ordering, not because it's needed this early.
  const currentQuestion = !draft.customerId && !draft.customerName.trim() && !newCustomerMode
    ? "Who is this invoice for? Say the customer's name, or type it below."
    : draft.items.length === 0
    ? "What would you like to invoice? Describe the items — for example, three hours of consulting at 100 euros, 21 percent VAT."
    : "Anything else to add? Say another item, or tap Review invoice when you're done.";
  const { speaking, repeat } = useSpeakQuestion(currentQuestion);

  if (isStaff) return null;

  // ── SUCCESS ────────────────────────────────────────────────────────────
  if (stage === "success" && createdInvoice) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors.successLight,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="checkmark" size={36} color={colors.success} />
          </View>
          <Text style={[typography.h2, { textAlign: "center" }]}>Invoice created</Text>
          <Card style={{ marginTop: spacing.lg, width: "100%" }}>
            <Row label="Invoice #" value={createdInvoice.invoiceNumber} />
            <Row label="Customer" value={createdInvoice.customerName} />
            <Row label="Total" value={formatCurrency(createdInvoice.total)} emphasize />
          </Card>
          <View style={{ marginTop: spacing.xl, width: "100%" }}>
            <PrimaryButton title="View invoice" onPress={() => router.replace(`/invoices/${createdInvoice.id}`)} />
          </View>
        </View>
      </Screen>
    );
  }

  // ── ERROR (invoice creation failed) ─────────────────────────────────────
  if (stage === "error") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors.dangerLight,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.lg,
            }}
          >
            <Ionicons name="alert" size={32} color={colors.danger} />
          </View>
          <Text style={[typography.h2, { textAlign: "center" }]}>Couldn&apos;t create the invoice</Text>
          <Text style={[typography.bodyMuted, { textAlign: "center", marginTop: spacing.xs }]}>{errorMessage}</Text>
          <View style={{ marginTop: spacing.xl, width: "100%", gap: spacing.md }}>
            <PrimaryButton title="Retry" onPress={createTheInvoice} />
            <Pressable onPress={() => setStage("review")} style={{ alignItems: "center", paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>Edit invoice</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  // ── CREATING (brief, blocking) ──────────────────────────────────────────
  if (stage === "creating") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <MicButton phase="processing" onPress={() => {}} />
          <Text style={[typography.body, { marginTop: spacing.lg }]}>Creating your invoice…</Text>
        </View>
      </Screen>
    );
  }

  // ── REVIEW ───────────────────────────────────────────────────────────────
  if (stage === "review") {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Text style={[typography.h2, { marginBottom: spacing.xs }]}>Review invoice</Text>
          <Text style={[typography.bodyMuted, { marginBottom: spacing.lg }]}>
            Nothing is created yet — check every field, then confirm.
          </Text>

          <Card style={{ marginBottom: spacing.lg }}>
            <FieldLabel>Customer</FieldLabel>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
              <Text style={typography.body}>{draft.customerName || "—"}</Text>
              <Pressable onPress={() => setStage("collect")}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Change</Text>
              </Pressable>
            </View>

            <FieldLabel>Invoice date</FieldLabel>
            <Input value={draft.date} onChangeText={(v) => setDraft((d) => ({ ...d, date: v }))} style={{ marginBottom: spacing.md }} />
            <FieldLabel>Due date</FieldLabel>
            <Input value={draft.dueDate} onChangeText={(v) => setDraft((d) => ({ ...d, dueDate: v }))} style={{ marginBottom: spacing.md }} />
            <FieldLabel>Notes (optional)</FieldLabel>
            <Input
              value={draft.notes}
              onChangeText={(v) => setDraft((d) => ({ ...d, notes: v }))}
              multiline
              style={{ minHeight: 60, textAlignVertical: "top" }}
            />
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.h3, { marginBottom: spacing.md }]}>Line items</Text>
            {draft.items.map((item) => (
              <View key={item.key} style={{ marginBottom: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Input
                  value={item.description}
                  onChangeText={(v) => updateLine(item.key, { description: v })}
                  placeholder="Description"
                  style={{ marginBottom: spacing.sm }}
                />
                <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <FieldLabel>Qty</FieldLabel>
                    <Input
                      value={String(item.quantity)}
                      onChangeText={(v) => updateLine(item.key, { quantity: Number(v) || 0 })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldLabel>Unit price</FieldLabel>
                    <Input
                      value={String(item.unitPrice)}
                      onChangeText={(v) => updateLine(item.key, { unitPrice: Number(v) || 0 })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldLabel>VAT %</FieldLabel>
                    <Input
                      value={String(item.vatRate)}
                      onChangeText={(v) => updateLine(item.key, { vatRate: Number(v) || 0 })}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={typography.bodyMuted}>Line total: {formatCurrency(item.quantity * item.unitPrice)}</Text>
                  <Pressable onPress={() => removeLine(item.key)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable onPress={addBlankLine} style={{ paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>+ Add line</Text>
            </Pressable>
          </Card>

          <Card style={{ marginBottom: spacing.lg }}>
            <Row label="Subtotal" value={formatCurrency(subtotal)} />
            <Row label="VAT" value={formatCurrency(vatTotal)} />
            <Row label="Total" value={formatCurrency(total)} emphasize />
          </Card>

          {validationError ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{validationError}</Text> : null}
          <PrimaryButton title="Create invoice" onPress={createTheInvoice} disabled={!!validationError} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── COLLECT (customer + voice capture) ──────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Text style={[typography.h2, { marginBottom: spacing.xs }]}>Create Invoice by Voice</Text>
        <Text style={[typography.bodyMuted, { marginBottom: spacing.lg }]}>
          Describe the invoice naturally and we&apos;ll prepare it for you.
        </Text>

        <AssistantQuestion text={currentQuestion} speaking={speaking} onRepeat={repeat} />

        {/* Step 1 — customer */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>1. Who is this for?</Text>
          {draft.customerId || draft.customerName ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={typography.body}>{draft.customerName}</Text>
              <Pressable onPress={() => setDraft((d) => ({ ...d, customerId: null, customerName: "", customerAddress: "" }))}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Change</Text>
              </Pressable>
            </View>
          ) : newCustomerMode ? (
            <>
              <Input
                value={newCustomerName}
                onChangeText={setNewCustomerName}
                placeholder="New customer name"
                style={{ marginBottom: spacing.md }}
              />
              {customerError ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{customerError}</Text> : null}
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Cancel" onPress={() => setNewCustomerMode(false)} disabled={creatingCustomer} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Create customer" onPress={confirmNewCustomer} loading={creatingCustomer} />
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
                <Input
                  value={customerQuery}
                  onChangeText={setCustomerQuery}
                  placeholder={
                    webSpeech.supported
                      ? "Say or type a customer name…"
                      : "Type a customer name, or use your keyboard's mic key…"
                  }
                  autoCapitalize="none"
                  style={{ flex: 1 }}
                />
                {webSpeech.supported ? (
                  <Pressable
                    onPress={answerCustomerByVoice}
                    accessibilityRole="button"
                    accessibilityLabel="Answer by voice"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: listeningCustomer ? colors.danger : colors.brandPrimary,
                    }}
                  >
                    <Ionicons name={listeningCustomer ? "stop" : "mic"} size={20} color={colors.textOnPrimary} />
                  </Pressable>
                ) : null}
              </View>
              {loadingCustomers ? (
                <SkeletonList count={2} withTrailing={false} />
              ) : customersError ? (
                <ErrorState message="Could not load customers." onRetry={() => refetchCustomers()} />
              ) : (
                <>
                  {filteredCustomers.slice(0, 5).map((c) => (
                    <Pressable key={c.id} onPress={() => selectCustomer(c)} style={{ paddingVertical: spacing.sm }}>
                      <Text style={typography.body}>{c.name}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => {
                      setNewCustomerMode(true);
                      setNewCustomerName(customerQuery);
                    }}
                    style={{ paddingVertical: spacing.sm }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>+ New customer</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </Card>

        {/* Step 2 — items, by voice */}
        <Card style={{ marginBottom: spacing.lg, alignItems: "center" }}>
          <Text style={[typography.h3, { marginBottom: spacing.xs, alignSelf: "flex-start" }]}>2. What are you invoicing?</Text>

          {draft.items.length > 0 ? (
            <View style={{ alignSelf: "stretch", marginBottom: spacing.md }}>
              {draft.items.map((item) => (
                <View key={item.key} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
                  <Text style={[typography.body, { flex: 1 }]}>
                    {item.quantity} × {item.description}
                  </Text>
                  <Text style={typography.body}>{formatCurrency(item.quantity * item.unitPrice)}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: colors.border, marginTop: spacing.xs }} />
            </View>
          ) : null}

          {micPhase === "processing" ? (
            <>
              <MicButton phase="processing" onPress={() => {}} />
              <Text style={[typography.bodyMuted, { marginTop: spacing.md }]}>Processing your invoice…</Text>
            </>
          ) : (
            <>
              <MicButton phase={micPhase} onPress={onMicPress} />
              <Text style={[typography.bodyMuted, { marginTop: spacing.md }]}>
                {micPhase === "recording"
                  ? webSpeech.supported
                    ? `Listening… ${formatElapsed(elapsed)} — tap to stop`
                    : "Type below, or use your keyboard's mic key"
                  : "Tap to start speaking"}
              </Text>
            </>
          )}

          {!webSpeech.supported && micPhase !== "idle" ? (
            <Input
              value={utterance}
              onChangeText={setUtterance}
              placeholder='e.g. "3 hours of consulting at 100 euros, 21% VAT"'
              multiline
              autoFocus
              style={{ marginTop: spacing.md, minHeight: 60, textAlignVertical: "top", alignSelf: "stretch" }}
            />
          ) : null}

          {lastConfirmation ? <Text style={[typography.caption, { marginTop: spacing.sm }]}>✨ {lastConfirmation}</Text> : null}
          {clarification ? <Text style={[typography.body, { marginTop: spacing.sm, color: colors.primary }]}>🤖 {clarification}</Text> : null}
          {parseError ? <Text style={{ color: colors.danger, marginTop: spacing.sm, textAlign: "center" }}>{parseError}</Text> : null}

          {!webSpeech.supported && micPhase !== "idle" ? (
            <View style={{ marginTop: spacing.md, alignSelf: "stretch" }}>
              <PrimaryButton title="Done speaking" onPress={() => runParse(utterance)} disabled={!utterance.trim()} />
            </View>
          ) : null}
        </Card>

        <PrimaryButton title="Review invoice" onPress={goToReview} disabled={draft.items.length === 0} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={[typography.caption, { marginBottom: spacing.xs }]}>{children}</Text>;
}

function Row({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs }}>
      <Text style={emphasize ? typography.h3 : typography.bodyMuted}>{label}</Text>
      <Text style={emphasize ? [typography.h3, { color: colors.primary }] : typography.body}>{value}</Text>
    </View>
  );
}

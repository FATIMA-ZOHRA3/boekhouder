import { apiRequest } from "./api";
import type {
  CategorySuggestion,
  ConversationSummary,
  DraftReplyResult,
  FinancialInsightsResponse,
  InsightPeriod,
  TaskSummary,
  TaxConceptExplanation,
  VoiceInvoiceItem,
  VoiceInvoiceParseResult,
} from "@/types/api";

// GET /api/ai/financial-insights — staff-only server-side ("ai.use").
// `clientId` is required by the backend; the mobile screen only reaches
// this from a client context (see app/(tabs)/clients/[id].tsx), so it's
// always supplied here rather than defaulting to the caller's own id like
// the read-only resource routes do.
export function getFinancialInsights(clientId: string, period: InsightPeriod = "this_month", range?: { start: string; end: string }) {
  return apiRequest<FinancialInsightsResponse>("/api/ai/financial-insights", {
    query: { clientId, period, start: range?.start, end: range?.end },
  });
}

// POST /api/ai/suggest-category — staff-only server-side ("ai.use"). Pass
// either an existing invoiceId (categorizes its line items) or a free-text
// description (used for a purchase document, which has no line items) —
// same contract as the backend route.
//
// `force` requests a fresh Groq call even if the same invoice/description was
// already categorized recently — without it, the backend returns the cached
// suggestion (`fromCache: true`). Default is false: regeneration must be
// explicitly requested by the user.
export function suggestCategory(params: { invoiceId?: string; description?: string; force?: boolean }) {
  return apiRequest<CategorySuggestion>("/api/ai/suggest-category", { method: "POST", body: params });
}

// POST /api/ai/draft-reply — staff-only server-side ("ai.use"). The draft
// is never sent automatically; the bookkeeper reviews/edits it and sends
// it themselves via POST /api/conversations/[id]/messages (see
// services/conversations.ts).
export function draftReply(conversationId: string) {
  return apiRequest<DraftReplyResult>("/api/ai/draft-reply", { method: "POST", body: { conversationId } });
}

// POST /api/ai/summarize-conversation — staff-only server-side ("ai.use").
export function summarizeConversation(conversationId: string) {
  return apiRequest<ConversationSummary>("/api/ai/summarize-conversation", { method: "POST", body: { conversationId } });
}

// POST /api/ai/summarize-task — staff-only server-side ("ai.use"). Turns a
// customer message into a proposed task title/description; the bookkeeper
// still has to create the task themselves (POST /api/tasks) with these
// values, same "AI proposes, accountant confirms" pattern as everywhere
// else — this endpoint never creates a task on its own.
export function summarizeTask(params: { messageText: string; customerName?: string }) {
  return apiRequest<TaskSummary>("/api/ai/summarize-task", { method: "POST", body: params });
}

// POST /api/ai/explain-tax-concept — open to both CLIENT and BOOKKEEPER
// ("ai.tax-concept.explain"). `concept` must be one of the fixed, pre-
// approved keys the backend recognizes (see app/fiscal/index.tsx for the
// ones actually wired up, mirroring the web client page) — this is
// intentionally NOT a free-text tax Q&A endpoint.
export function explainTaxConcept(concept: string, amounts?: Record<string, number>) {
  return apiRequest<TaxConceptExplanation>("/api/ai/explain-tax-concept", { method: "POST", body: { concept, amounts } });
}

// POST /api/ai/voice-invoice/parse-item — client-only server-side
// ("ai.voice-invoice.use", not in STAFF_PERMISSIONS — see the phase-1
// audit). Expects already-transcribed TEXT (`utterance`), never audio —
// the backend itself has no speech-to-text step (confirmed by reading the
// route). The web app gets that text from the browser's Web Speech API
// with a manual-typing fallback; there's no RN/Expo-Go equivalent of that
// browser API, so the mobile screen (app/purchases/voice-invoice or
// wherever it's wired up) relies on the device keyboard's own built-in
// dictation (the mic key on iOS/Android keyboards) typing straight into
// a normal TextInput — zero native speech dependencies added, per the
// phase-1 audit's constraint.
export function parseVoiceInvoiceItem(params: { utterance: string; existingItems: VoiceInvoiceItem[]; defaultVatRate: number }) {
  return apiRequest<VoiceInvoiceParseResult>("/api/ai/voice-invoice/parse-item", { method: "POST", body: params });
}

// POST /api/ai/assistant — read-only Q&A over the caller's own data.
// The mobile app never computes or invents an answer itself: it only sends
// the question (plus a short trailing history for follow-ups) and displays
// exactly what the backend returns. All AI logic stays server-side.
export type AssistantHistoryTurn = { role: "user" | "assistant"; content: string };

export type AssistantResponse = {
  answer: string;
  scopedTo?: string | null;
};

export function askAssistant(question: string, history: AssistantHistoryTurn[] = []) {
  return apiRequest<AssistantResponse>("/api/ai/assistant", {
    method: "POST",
    body: { question, history },
  });
}

import { apiRequest } from "./api";
import type { Conversation, ConversationMessage } from "@/types/api";

// GET /api/conversations — identity-aware server-side
// (src/app/api/conversations/route.ts): a client account gets back only
// their own conversations, bookkeeper/admin get every conversation across
// every client (there's no ?clientId= filter on the backend route, and no
// per-bookkeeper client-assignment table — see the audit notes — so
// "authorized" here means "is staff at all", same as everywhere else in
// this app). When `clientId` is passed, it's applied client-side only, to
// show one client's thread from their detail screen.
export function getConversations(clientId?: string) {
  return apiRequest<Conversation[]>("/api/conversations").then((all) =>
    clientId ? all.filter((c) => c.userId === clientId) : all
  );
}

export function getConversation(id: string) {
  return apiRequest<Conversation>(`/api/conversations/${id}`);
}

// POST /api/conversations/[id]/messages — the "user manually sends" step
// after reviewing/editing an AI draft reply, or an ordinary message. This
// never fires automatically from the Draft Reply feature.
export function sendMessage(conversationId: string, text: string) {
  return apiRequest<ConversationMessage>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { text },
  });
}

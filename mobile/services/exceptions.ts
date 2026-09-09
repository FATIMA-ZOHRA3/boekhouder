import { apiRequest } from "./api";
import type { ExceptionItem } from "@/types/api";

// GET /api/exceptions — identity-aware server-side: staff (bookkeeper/
// admin) get every exception across every client, a client account gets
// only their own. The backend route itself has no ?clientId= filter (see
// src/app/api/exceptions/route.ts), so when a bookkeeper wants one
// client's exceptions — e.g. from the Accounting hub while an active
// client is selected — that narrowing is applied client-side on the
// already-scoped (staff = every client) response, same pattern as
// getConversations().
export function getExceptions(clientId?: string) {
  return apiRequest<ExceptionItem[]>("/api/exceptions").then((all) =>
    clientId ? all.filter((e) => e.userId === clientId) : all
  );
}

// There's no GET /api/exceptions/[id] — only PATCH (see that route) — so a
// single exception's detail is found by filtering the list response
// (cached under the "exceptions" query key) rather than a second request.

// POST /api/exceptions/[id]/respond — client-only server-side (the route
// checks `item.userId !== session.userId`); the app only shows the
// response form to the exception's own owner (see exceptions/[id].tsx).
export function respondToException(id: string, response: string, notes?: string) {
  const formData = new FormData();
  formData.append("response", response);
  if (notes) formData.append("notes", notes);
  return apiRequest<ExceptionItem>(`/api/exceptions/${id}/respond`, {
    method: "POST",
    body: formData,
    isFormData: true,
  });
}

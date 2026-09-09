import { apiRequest } from "./api";
import type { RecurringInvoice } from "@/types/api";

// GET /api/recurring-invoices is always scoped to the caller's own
// session.userId server-side (no ?clientId= support, unlike invoices/
// quotations — see src/app/api/recurring-invoices/route.ts), so this is
// client-only in the mobile app, same as the web client portal.
export function getRecurringInvoices() {
  return apiRequest<RecurringInvoice[]>("/api/recurring-invoices");
}

// PATCH is ownership-scoped server-side (updateMany where clientId: me),
// so only the owning client can toggle their own recurring invoice.
export function setRecurringInvoiceActive(id: string, active: boolean) {
  return apiRequest<{ success: true }>(`/api/recurring-invoices/${id}`, {
    method: "PATCH",
    body: { active },
  });
}

export function deleteRecurringInvoice(id: string) {
  return apiRequest<{ success: true }>(`/api/recurring-invoices/${id}`, { method: "DELETE" });
}

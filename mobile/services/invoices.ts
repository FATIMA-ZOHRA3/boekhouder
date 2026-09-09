import { apiRequest } from "./api";
import type { Invoice } from "@/types/api";

// GET /api/invoices — already scoped server-side: a client only ever gets
// their own invoices, staff get everything, or one client's when
// `clientId` is passed (ignored server-side for a client caller — see
// `effectiveClientId` in src/app/api/invoices/route.ts). Used by the
// bookkeeper's Client detail screen to scope down to one client's
// invoices; omitted, staff get the full cross-client list.
export function getInvoices(clientId?: string) {
  return apiRequest<Invoice[]>("/api/invoices", { query: clientId ? { clientId } : undefined });
}

export function getInvoice(id: string) {
  return apiRequest<Invoice>(`/api/invoices/${id}`);
}

// The PDF route (GET /api/invoices/[id]/pdf?download=1) requires no auth
// and streams the file directly, so the app opens it with the system PDF
// viewer / share sheet instead of re-implementing rendering — see
// invoices/[id].tsx.
export function getInvoicePdfPath(id: string) {
  return `/api/invoices/${id}/pdf?download=1`;
}

// POST /api/invoices — clientId is forced server-side to the caller for a
// non-staff session (see src/app/api/invoices/route.ts), so a client can
// only ever create an invoice for themselves. Status defaults to "draft"
// server-side when omitted — used by the Voice Invoice review step so the
// bookkeeper still reviews it before it's finalized, same as any other
// invoice.
export function createInvoice(params: {
  customerId?: string | null;
  customerName: string;
  customerAddress?: string;
  date: string;
  dueDate: string;
  items: { description: string; quantity: number; unitPrice: number; vatRate: number }[];
  notes?: string;
}) {
  return apiRequest<Invoice>("/api/invoices", { method: "POST", body: params });
}

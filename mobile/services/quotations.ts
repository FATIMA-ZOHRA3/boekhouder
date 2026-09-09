import { apiRequest } from "./api";
import type { Quotation } from "@/types/api";

// GET /api/quotations — same identity-aware scoping as GET /api/invoices:
// a client always gets their own, staff get everything or one client's
// via ?clientId= — see src/app/api/quotations/route.ts.
export function getQuotations(clientId?: string) {
  return apiRequest<Quotation[]>("/api/quotations", { query: clientId ? { clientId } : undefined });
}

export function getQuotation(id: string) {
  return apiRequest<Quotation>(`/api/quotations/${id}`);
}

// Same pattern as invoices' PDF route: GET ?download=1 requires no extra
// auth beyond the session already attached to every request and streams
// the file directly — see invoices/[id].tsx for how it's opened.
export function getQuotationPdfPath(id: string) {
  return `/api/quotations/${id}/pdf?download=1`;
}

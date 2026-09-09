import { apiRequest } from "./api";
import type { FiscalSummary } from "@/types/api";

// GET /api/fiscal — a client account always gets their own summary; staff
// must pass clientId (the route defaults to the caller's own id otherwise,
// which is meaningless for a bookkeeper/admin — see
// src/app/api/fiscal/route.ts). Used by the client's own "Tax & VAT"
// profile link and the bookkeeper's per-client Fiscal view.
export function getFiscalSummary(clientId?: string) {
  return apiRequest<FiscalSummary>("/api/fiscal", { query: clientId ? { clientId } : undefined });
}

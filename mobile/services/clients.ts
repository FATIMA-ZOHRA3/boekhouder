import { apiRequest } from "./api";
import type { ClientSummary } from "@/types/api";

// GET /api/clients — identity-aware server-side (src/app/api/clients/route.ts):
// bookkeeper/admin get the full client portfolio, a client account gets
// back only their own record. This is the "portfolio of accounts a
// bookkeeper manages" list — a different concept from services/customers.ts
// (which is the invoicing customers *of one* client/administration).
//
// The backend returns full User rows (it's also used by the web
// bookkeeper UI, which this project's rules say not to change), including
// fields the mobile app has no business reading (e.g. passwordHash) — so
// this is typed as ClientSummary rather than the raw response, and only
// the fields actually used are destructured out below.
export async function getClients(): Promise<ClientSummary[]> {
  const raw = await apiRequest<Record<string, unknown>[]>("/api/clients");
  return raw.map((u) => ({
    id: u.id as string,
    name: u.name as string,
    email: u.email as string,
    company: (u.company as string | null) ?? null,
    phone: (u.phone as string | null) ?? null,
    vatNumber: (u.vatNumber as string | null) ?? null,
    kvkNumber: (u.kvkNumber as string | null) ?? null,
  }));
}

import { apiRequest } from "./api";
import type { BankTransaction } from "@/types/api";

// GET /api/bank/transactions requires the "bank.read" permission, which
// only bookkeeper/admin have (src/lib/permissions.ts) — a client account
// gets a 403. The mobile app only ever reaches this screen from
// staff-only entry points (the Accounting tab, or a Client detail
// screen), matching the backend rather than the illustrative role mockup
// in the task brief. Optional `clientId`/`status` mirror the route's own
// filters — used to scope to one client, or to just the "new"
// (unmatched) transactions for the Accounting dashboard's count.
export function getBankTransactions(params?: { clientId?: string; status?: string }) {
  return apiRequest<BankTransaction[]>("/api/bank/transactions", { query: params });
}

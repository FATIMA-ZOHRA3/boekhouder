import { getSession, type Role } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { roleHasPermission, type Permission } from "@/lib/permissions";
import {
  SEARCH_TYPE_ORDER,
  SEARCH_TYPE_LABEL,
  normalizeQuery,
  isQueryTooShort,
  clampLimit,
  parseAmountQuery,
  buildCustomerWhere,
  buildInvoiceWhere,
  buildPurchaseWhere,
  buildBankTransactionWhere,
  buildQuotationWhere,
  buildJournalEntryWhere,
  buildLedgerAccountWhere,
  normalizeCustomer,
  normalizeInvoice,
  normalizePurchase,
  normalizeBankTransaction,
  normalizeQuotation,
  normalizeJournalEntry,
  normalizeLedgerAccount,
  TYPE_IS_CLIENT_SCOPED,
  type SearchResultType,
  type SearchResultItem,
  type SearchResultGroup,
} from "@/lib/search";

// Which existing permission (see permissions.ts) gates each entity type. This
// is the ONLY place that decides "can this role search this at all" — change
// ROLE_PERMISSIONS and search adapts automatically, same as every other route.
// Lives here (not in lib/search.ts) because it needs `roleHasPermission`,
// which imports `prisma` — fine in a route (server-only), but lib/search.ts
// is also imported by client components and must stay free of that chain
// (see the comment at the top of lib/search.ts).
const TYPE_PERMISSION: Record<SearchResultType, Permission> = {
  customer: "customer.read",
  invoice: "invoice.read",
  purchase: "purchase.read",
  bank_transaction: "bank.read",
  quotation: "quotation.read",
  journal_entry: "journal.manage",
  ledger_account: "ledger.manage",
};

function getSearchableTypes(role: Role): SearchResultType[] {
  return SEARCH_TYPE_ORDER.filter((type) => roleHasPermission(role, TYPE_PERMISSION[type]));
}

// GET /api/search?q=...&clientId=...&types=customer,invoice&status=&dateFrom=&dateTo=&limit=5
//
// One centralized, server-side, authenticated search across the entities
// listed in the Phase 5 spec. No new database models/fields; every query
// below is database-level filtering (Prisma `where`, capped `take`) — the
// full table is never loaded into memory or sent to the browser (spec Step
// 13). Authorization is enforced here, not just hidden in the UI (Step 12 /
// Step 20): each entity type is gated by the exact same permission
// (`roleHasPermission`) its own dedicated route already uses, and
// client-scoped types are always constrained to a single administration —
// see the comment on `scopedTypes` below.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get("q"));
  const isStaff = session.role === "bookkeeper" || session.role === "admin";

  // Staff pick one administration at a time everywhere else in the app
  // (AdministrationProvider, Control Center, sidebar counters). Global
  // Search follows the same rule instead of introducing a new "search across
  // every customer at once" mode: a client-scoped result can therefore only
  // ever belong to the administration the bookkeeper currently has open. A
  // client can never override their own scope — the query param is simply
  // ignored for that role, same pattern as invoices/route.ts.
  const requestedClientId = searchParams.get("clientId");
  const clientId = isStaff
    ? requestedClientId && requestedClientId !== "all"
      ? requestedClientId
      : null
    : session.userId;

  const requestedTypesParam = searchParams.get("types");
  const requestedTypes = requestedTypesParam
    ? new Set(requestedTypesParam.split(",").map((t) => t.trim()))
    : null;

  const status = searchParams.get("status") || null;
  const dateFrom = searchParams.get("dateFrom") || null;
  const dateTo = searchParams.get("dateTo") || null;
  const limit = clampLimit(searchParams.get("limit"));

  // Every type this role is permitted to search at all, further narrowed by
  // an explicit `types` filter (Step 10, the full search page's Type facet).
  const searchableTypes = getSearchableTypes(session.role).filter(
    (type) => !requestedTypes || requestedTypes.has(type)
  );

  const baseResponse = {
    query,
    isStaff,
    clientId,
    searchableTypes,
  };

  // Step 6: never touch the database for an empty/too-short query.
  if (isQueryTooShort(query)) {
    return Response.json({ ...baseResponse, scopedTypes: [], groups: [], results: [] });
  }

  // Client-scoped types (customer/invoice/purchase/bank/quotation) need a
  // concrete administration to search within. Firm-wide types (journal
  // entries, the ledger) aren't owned by any one customer, so they stay
  // searchable even before a bookkeeper has picked an administration —
  // "better to show nothing than leak data from another admin" (the same
  // reasoning already used for the sidebar's badge counts) only applies to
  // the types that actually belong to a customer.
  const scopedTypes = searchableTypes.filter((type) => !TYPE_IS_CLIENT_SCOPED[type] || clientId);

  const amountQuery = parseAmountQuery(query);

  const groups = (
    await Promise.all(scopedTypes.map((type) => runTypeQuery(type, { query, clientId, status, dateFrom, dateTo, amountQuery, limit, isStaff })))
  ).filter((group): group is SearchResultGroup => group.items.length > 0);

  const results = groups.flatMap((g) => g.items);

  return Response.json({ ...baseResponse, scopedTypes, groups, results });
}

interface RunParams {
  query: string;
  clientId: string | null;
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  amountQuery: number | null;
  limit: number;
  isStaff: boolean;
}

// Fetches `limit + 1` rows so `hasMore` (used for "View all results", Step 8)
// is known without a second COUNT round-trip, then trims back to `limit`.
async function runTypeQuery(type: SearchResultType, params: RunParams): Promise<SearchResultGroup> {
  const { query, clientId, status, dateFrom, dateTo, amountQuery, limit, isStaff } = params;
  const take = limit + 1;
  let items: SearchResultItem[] = [];
  let hasMore = false;

  switch (type) {
    case "customer": {
      const rows = await prisma.customer.findMany({
        where: buildCustomerWhere(query, clientId),
        select: { id: true, name: true, email: true, vatNumber: true, city: true },
        orderBy: { createdAt: "desc" },
        take,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).map((r) => normalizeCustomer(r, isStaff));
      break;
    }
    case "invoice": {
      const rows = await prisma.invoice.findMany({
        where: buildInvoiceWhere(query, clientId, status, dateFrom, dateTo),
        select: { id: true, invoiceNumber: true, customerName: true, total: true, status: true },
        orderBy: { createdAt: "desc" },
        take,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).map((r) => normalizeInvoice(r, isStaff));
      break;
    }
    case "purchase": {
      const rows = await prisma.purchaseDocument.findMany({
        where: buildPurchaseWhere(query, clientId, status, dateFrom, dateTo),
        select: { id: true, supplierName: true, fileName: true, category: true, totalAmount: true, amount: true, status: true },
        orderBy: { createdAt: "desc" },
        take,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).map((r) => normalizePurchase(r, isStaff));
      break;
    }
    case "bank_transaction": {
      const rows = await prisma.bankTransaction.findMany({
        where: buildBankTransactionWhere(query, clientId, amountQuery, status, dateFrom, dateTo),
        select: { id: true, description: true, counterparty: true, amount: true, direction: true, status: true },
        orderBy: { transactionDate: "desc" },
        take,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).map(normalizeBankTransaction);
      break;
    }
    case "quotation": {
      const rows = await prisma.quotation.findMany({
        where: buildQuotationWhere(query, clientId, status, dateFrom, dateTo),
        select: { id: true, quotationNumber: true, customerName: true, total: true, status: true },
        orderBy: { createdAt: "desc" },
        take,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).map(normalizeQuotation);
      break;
    }
    case "journal_entry": {
      const rows = await prisma.journalEntry.findMany({
        where: buildJournalEntryWhere(query, status, dateFrom, dateTo),
        select: { id: true, reference: true, description: true, totalDebit: true, status: true },
        orderBy: { createdAt: "desc" },
        take,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).map(normalizeJournalEntry);
      break;
    }
    case "ledger_account": {
      const rows = await prisma.ledgerAccount.findMany({
        where: buildLedgerAccountWhere(query),
        select: { id: true, accountNumber: true, name: true, category: true, accountType: true },
        orderBy: { sortOrder: "asc" },
        take,
      });
      hasMore = rows.length > limit;
      items = rows.slice(0, limit).map(normalizeLedgerAccount);
      break;
    }
  }

  return { type, label: SEARCH_TYPE_LABEL[type], items, hasMore };
}

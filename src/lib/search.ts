// ---------------------------------------------------------------------------
// Global Search — pure logic
// ---------------------------------------------------------------------------
// Phase 5. Everything here is deliberately framework/DB-agnostic and pure
// (same spirit as controlCenter.ts): given plain inputs, return plain outputs.
//
// CLIENT-SAFE ON PURPOSE: this file is imported directly by client components
// (GlobalSearch.tsx, SearchResultsView.tsx) for its types/constants, so it
// must never import anything that transitively pulls in `prisma` (which
// drags the Postgres driver into the browser bundle and breaks `next build`
// with "Module not found: net/tls" — hit this for real while validating and
// fixed it by keeping the split below). Permission-checking
// (`roleHasPermission`, `getSearchableTypes`) therefore lives in the route
// file instead, which is server-only already. `formatCurrency` from
// controlCenter.ts is safe to import: that module only reaches
// exceptionSeverity.ts, which has zero imports of its own.
//
// Reused instead of duplicated:
// - Auth/session:      @/lib/auth (getSession)
// - Permission matrix: @/lib/permissions (roleHasPermission, Permission) — server-side only, see route.ts
// - Currency display:  @/lib/controlCenter (formatCurrency)
// No new database models or fields were introduced for this feature — see
// the final report for the couple of spec fields (e.g. a "customer number")
// that don't exist on any model and were therefore left out rather than
// invented.
// ---------------------------------------------------------------------------

import { formatCurrency } from "./controlCenter";

export type SearchResultType =
  | "customer"
  | "invoice"
  | "purchase"
  | "bank_transaction"
  | "quotation"
  | "journal_entry"
  | "ledger_account";

// Display order used everywhere results are grouped (dropdown, /search page,
// final report). Mirrors the order the spec itself lists the entities in.
export const SEARCH_TYPE_ORDER: SearchResultType[] = [
  "customer",
  "invoice",
  "purchase",
  "bank_transaction",
  "quotation",
  "journal_entry",
  "ledger_account",
];

export const SEARCH_TYPE_LABEL: Record<SearchResultType, string> = {
  customer: "Customers",
  invoice: "Invoices",
  purchase: "Purchases",
  bank_transaction: "Bank transactions",
  quotation: "Quotations",
  journal_entry: "Journal entries",
  ledger_account: "Ledger accounts",
};

// Which existing permission (see permissions.ts) gates each entity type.
// NOTE: this table lives in the route (server-only), not here — see the
// file header for why. Kept as a comment here only for discoverability:
//   customer -> customer.read   invoice -> invoice.read
//   purchase -> purchase.read   bank_transaction -> bank.read
//   quotation -> quotation.read journal_entry -> journal.manage
//   ledger_account -> ledger.manage

// Client-scoped types belong to one administration (userId/clientId on the
// row) and must never mix data from two administrations in one result list.
// Firm-wide types (the chart of accounts, the memoriaal) aren't owned by any
// single customer, so they don't need — and can't use — that scoping.
export const TYPE_IS_CLIENT_SCOPED: Record<SearchResultType, boolean> = {
  customer: true,
  invoice: true,
  purchase: true,
  bank_transaction: true,
  quotation: true,
  journal_entry: false,
  ledger_account: false,
};

export interface SearchResultItem {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  metadata?: string;
  href: string;
}

export interface SearchResultGroup {
  type: SearchResultType;
  label: string;
  items: SearchResultItem[];
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Query validation
// ---------------------------------------------------------------------------

export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 25;

export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

export function isQueryTooShort(query: string): boolean {
  return query.length < SEARCH_MIN_QUERY_LENGTH;
}

export function clampLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return SEARCH_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), SEARCH_MAX_LIMIT);
}

// Bank transactions can be searched by amount (spec: "amount" under Bank
// Transactions). Only treated as a numeric query when the whole string looks
// like a number, so invoice-style queries like "INV-2026" never get parsed
// as an amount. Accepts either "." or "," as the decimal separator (this app
// is Dutch/EU-facing — 149,00 and 149.00 both mean the same amount).
export function parseAmountQuery(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^-?\d[\d.,\s]*$/.test(trimmed)) return null;

  const cleaned = trimmed.replace(/\s/g, "");
  const decimalIndex = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  const normalized =
    decimalIndex === -1
      ? cleaned
      : `${cleaned.slice(0, decimalIndex).replace(/[.,]/g, "")}.${cleaned.slice(decimalIndex + 1)}`;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Destinations — every href below points at a route that already exists in
// the app today (verified by reading the actual page/section source, not
// guessed). None of these paths were invented for this feature.
//
//   invoice          -> /bookkeeper/invoices/[id]            (dedicated route)
//                     -> /client/invoices/[id]/view           (dedicated route)
//   customer         -> /bookkeeper?section=sales&tab=debiteurenbeheer
//                        (bookkeeper/page.tsx has no per-customer route —
//                        customers are derived from invoices into this tab)
//                     -> /client/customers                    (list page only)
//   purchase         -> /bookkeeper?section=purchases | /client?section=purchases
//                        (opened via in-page state, not a URL id, in both portals)
//   bank_transaction -> /bookkeeper?section=bank              (staff-only type)
//   journal_entry    -> /bookkeeper?section=memoriaal
//   ledger_account   -> /bookkeeper?section=general ledger    (exact string
//                        copied from the sidebar's own href in layout.tsx)
//   quotation        -> /client/quotations/[id]/view for BOTH roles — this is
//                        the only quotation detail page anywhere in the app.
//                        proxy.ts already allows staff into /client/*, and
//                        GET /api/quotations/[id] already allows staff to
//                        load any quotation, so the page works correctly for
//                        a bookkeeper; it just briefly shows the client
//                        portal's chrome. Documented as a known limitation
//                        rather than inventing a new bookkeeper-side page,
//                        which the spec says not to do this phase.
// ---------------------------------------------------------------------------

export function buildResultHref(type: SearchResultType, id: string, isStaff: boolean): string {
  switch (type) {
    case "invoice":
      return isStaff ? `/bookkeeper/invoices/${id}` : `/client/invoices/${id}/view`;
    case "customer":
      // Phase 7: a dedicated per-customer page now exists
      // (app/bookkeeper/customers/[id]/page.tsx) — link straight to it
      // instead of the generic debtor list, the same way "invoice" already
      // links to a specific invoice rather than the invoice list.
      return isStaff ? `/bookkeeper/customers/${id}` : `/client/customers`;
    case "purchase":
      return isStaff ? `/bookkeeper?section=purchases` : `/client?section=purchases`;
    case "bank_transaction":
      return `/bookkeeper?section=bank`;
    case "journal_entry":
      return `/bookkeeper?section=memoriaal`;
    case "ledger_account":
      return `/bookkeeper?section=general ledger`;
    case "quotation":
      return `/client/quotations/${id}/view`;
  }
}

function titleCaseStatus(status: string): string {
  const spaced = status.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------------------------------------------------------------------------
// Row -> SearchResultItem normalizers
// ---------------------------------------------------------------------------
// Field selection matches Prisma `select` in the route exactly — keep these
// in sync if either side changes.

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  vatNumber: string | null;
  city: string | null;
}

export function normalizeCustomer(c: CustomerRow, isStaff: boolean): SearchResultItem {
  return {
    type: "customer",
    id: c.id,
    title: c.name,
    subtitle: c.city ? `Customer · ${c.city}` : "Customer",
    metadata: c.vatNumber ? `VAT ${c.vatNumber}` : c.email ?? undefined,
    href: buildResultHref("customer", c.id, isStaff),
  };
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  customerName: string;
  total: number;
  status: string;
}

export function normalizeInvoice(inv: InvoiceRow, isStaff: boolean): SearchResultItem {
  return {
    type: "invoice",
    id: inv.id,
    title: inv.invoiceNumber,
    subtitle: inv.customerName,
    metadata: `${formatCurrency(inv.total)} · ${titleCaseStatus(inv.status)}`,
    href: buildResultHref("invoice", inv.id, isStaff),
  };
}

export interface PurchaseRow {
  id: string;
  supplierName: string | null;
  fileName: string;
  category: string | null;
  totalAmount: number | null;
  amount: number | null;
  status: string;
}

export function normalizePurchase(p: PurchaseRow, isStaff: boolean): SearchResultItem {
  const amount = p.totalAmount ?? p.amount;
  return {
    type: "purchase",
    id: p.id,
    title: p.supplierName || p.fileName,
    subtitle: p.category || "Purchase",
    metadata: amount != null ? `${formatCurrency(amount)} · ${titleCaseStatus(p.status)}` : titleCaseStatus(p.status),
    href: buildResultHref("purchase", p.id, isStaff),
  };
}

export interface BankTransactionRow {
  id: string;
  description: string;
  counterparty: string | null;
  amount: number;
  direction: string;
  status: string;
}

export function normalizeBankTransaction(t: BankTransactionRow): SearchResultItem {
  const sign = t.direction === "debit" ? "-" : "+";
  return {
    type: "bank_transaction",
    id: t.id,
    title: t.description,
    subtitle: t.counterparty || (t.direction === "credit" ? "Money in" : "Money out"),
    metadata: `${sign}${formatCurrency(t.amount)} · ${titleCaseStatus(t.status)}`,
    // Bank transactions are staff-only (no bank.read for clients), so the
    // href is always the bookkeeper one — see buildResultHref.
    href: buildResultHref("bank_transaction", t.id, true),
  };
}

export interface QuotationRow {
  id: string;
  quotationNumber: string;
  customerName: string;
  total: number;
  status: string;
}

export function normalizeQuotation(q: QuotationRow): SearchResultItem {
  return {
    type: "quotation",
    id: q.id,
    title: q.quotationNumber,
    subtitle: q.customerName,
    metadata: `${formatCurrency(q.total)} · ${titleCaseStatus(q.status)}`,
    href: buildResultHref("quotation", q.id, false),
  };
}

export interface JournalEntryRow {
  id: string;
  reference: string;
  description: string;
  totalDebit: number;
  status: string;
}

export function normalizeJournalEntry(j: JournalEntryRow): SearchResultItem {
  return {
    type: "journal_entry",
    id: j.id,
    title: j.reference,
    subtitle: j.description,
    metadata: `${formatCurrency(j.totalDebit)} · ${titleCaseStatus(j.status)}`,
    href: buildResultHref("journal_entry", j.id, true),
  };
}

export interface LedgerAccountRow {
  id: string;
  accountNumber: string;
  name: string;
  category: string;
  accountType: string;
}

export function normalizeLedgerAccount(l: LedgerAccountRow): SearchResultItem {
  return {
    type: "ledger_account",
    id: l.id,
    title: `${l.accountNumber} · ${l.name}`,
    subtitle: l.category,
    metadata: titleCaseStatus(l.accountType),
    href: buildResultHref("ledger_account", l.id, true),
  };
}

// ---------------------------------------------------------------------------
// Prisma `where` builders
// ---------------------------------------------------------------------------
// Plain objects in, plain objects out — no Prisma import needed, so these are
// cheap to unit test (e.g. "a client-scoped where always pins userId, no
// matter what the caller passes as q"). `clientId: null` means "no
// administration filter", which the route only ever does for the two
// firm-wide types (journal_entry, ledger_account) or when a staff member
// hasn't picked an administration yet.

type Where = Record<string, unknown>;

function dateRange(field: string, dateFrom: string | null, dateTo: string | null): Where {
  if (!dateFrom && !dateTo) return {};
  const range: Record<string, string> = {};
  if (dateFrom) range.gte = dateFrom;
  if (dateTo) range.lte = dateTo;
  return { [field]: range };
}

export function buildCustomerWhere(q: string, clientId: string | null): Where {
  return {
    ...(clientId ? { userId: clientId } : {}),
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { vatNumber: { contains: q, mode: "insensitive" } },
      { kvkNumber: { contains: q, mode: "insensitive" } },
    ],
  };
}

export function buildInvoiceWhere(
  q: string,
  clientId: string | null,
  status: string | null,
  dateFrom: string | null,
  dateTo: string | null
): Where {
  return {
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
    ...dateRange("date", dateFrom, dateTo),
    OR: [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { status: { contains: q, mode: "insensitive" } },
    ],
  };
}

export function buildPurchaseWhere(
  q: string,
  clientId: string | null,
  status: string | null,
  dateFrom: string | null,
  dateTo: string | null
): Where {
  return {
    ...(clientId ? { userId: clientId } : {}),
    ...(status ? { status } : {}),
    ...dateRange("documentDate", dateFrom, dateTo),
    OR: [
      { supplierName: { contains: q, mode: "insensitive" } },
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { fileName: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
  };
}

export function buildBankTransactionWhere(
  q: string,
  clientId: string | null,
  amount: number | null,
  status: string | null,
  dateFrom: string | null,
  dateTo: string | null
): Where {
  const or: Where[] = [
    { description: { contains: q, mode: "insensitive" } },
    { counterparty: { contains: q, mode: "insensitive" } },
    { importBatchId: { contains: q, mode: "insensitive" } },
  ];
  if (amount != null) {
    or.push({ amount: { gte: amount - 0.005, lte: amount + 0.005 } });
  }
  return {
    ...(clientId ? { userId: clientId } : {}),
    ...(status ? { status } : {}),
    ...dateRange("transactionDate", dateFrom, dateTo),
    OR: or,
  };
}

export function buildQuotationWhere(
  q: string,
  clientId: string | null,
  status: string | null,
  dateFrom: string | null,
  dateTo: string | null
): Where {
  return {
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
    ...dateRange("date", dateFrom, dateTo),
    OR: [
      { quotationNumber: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { status: { contains: q, mode: "insensitive" } },
    ],
  };
}

// Journal entries are firm-wide — no clientId parameter. `description` is
// included alongside the spec's "reference" because the reference alone
// (an auto-generated "MEM-003") isn't something a person would think to
// search for; the description is the human-written label. Flagged in the
// final report as a deliberate small addition, not a silent deviation.
export function buildJournalEntryWhere(
  q: string,
  status: string | null,
  dateFrom: string | null,
  dateTo: string | null
): Where {
  return {
    ...(status ? { status } : {}),
    ...dateRange("date", dateFrom, dateTo),
    OR: [
      { reference: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
  };
}

// Ledger accounts are firm-wide — mirrors the existing GET /api/ledger-accounts
// ?search= implementation exactly (same two fields, same contains/insensitive).
export function buildLedgerAccountWhere(q: string): Where {
  return {
    OR: [
      { accountNumber: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ],
  };
}

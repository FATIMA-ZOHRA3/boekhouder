// ---------------------------------------------------------------------------
// Activity & Audit Timeline — pure display logic
// ---------------------------------------------------------------------------
// Phase 6. Same spirit as lib/search.ts and lib/controlCenter.ts: given plain
// inputs, return plain outputs. No new database models/fields — this reuses
// the existing `AuditLog` model (see lib/auditLog.ts and the call sites
// listed there) and simply makes it presentable.
//
// CLIENT-SAFE ON PURPOSE: imported by the ActivityTimeline component (a
// client component), so this file must never import anything that
// transitively pulls in `prisma` — same constraint documented at the top of
// lib/search.ts. Permission checks and DB scoping live in
// app/api/audit-logs/route.ts (server-only) instead.
//
// `buildResultHref` from lib/search.ts is reused as-is for entity links —
// every href an activity item can carry is therefore a route that was
// already verified to exist for the Global Search feature. No new URLs are
// invented here.
// ---------------------------------------------------------------------------

import { buildResultHref, type SearchResultType } from "./search";
import { formatCurrency } from "./controlCenter";

// Mirrors the AuditEntity union in lib/auditLog.ts. Duplicated (not
// imported) because lib/auditLog.ts pulls in ./prisma — importing it here
// would break the client-safety guarantee above. Kept in sync manually;
// see the comment on AuditEntity there.
export type AuditEntity =
  | "Invoice"
  | "Quotation"
  | "PurchaseDocument"
  | "BankTransaction"
  | "CashTransaction"
  | "ExceptionItem"
  | "JournalEntry"
  | "Customer"
  | "User"
  | "LedgerAccount"
  | "VatCode"
  | "RecurringInvoice"
  | "SystemSetting";

export const ENTITY_LABEL: Record<AuditEntity, string> = {
  Invoice: "Invoice",
  Quotation: "Quotation",
  PurchaseDocument: "Purchase",
  BankTransaction: "Bank",
  CashTransaction: "Cash",
  ExceptionItem: "Exception",
  JournalEntry: "Accounting",
  Customer: "Customer",
  User: "User",
  LedgerAccount: "Ledger",
  VatCode: "VAT",
  RecurringInvoice: "Recurring invoice",
  SystemSetting: "System",
};

// Client-scoped entities belong to one administration (a clientId/userId on
// the row) and must never mix data from two administrations. Firm-wide
// entities (the memoriaal, the chart of accounts, VAT codes, system
// settings) aren't owned by any single customer — exact same distinction as
// TYPE_IS_CLIENT_SCOPED in lib/search.ts, applied to the audit trail.
export const ENTITY_IS_CLIENT_SCOPED: Record<AuditEntity, boolean> = {
  Invoice: true,
  Quotation: true,
  PurchaseDocument: true,
  BankTransaction: true,
  CashTransaction: true,
  ExceptionItem: true,
  Customer: true,
  RecurringInvoice: true,
  User: true,
  JournalEntry: false,
  LedgerAccount: false,
  VatCode: false,
  SystemSetting: false,
};

// Maps an AuditEntity to the closest existing SearchResultType so activity
// items can reuse buildResultHref (Phase 5) instead of inventing new routes.
// Entities with no equivalent in Global Search (ExceptionItem, User, VatCode,
// RecurringInvoice, SystemSetting) simply get no link — Step 10 of the spec:
// "If an entity cannot safely be linked, simply display the activity without
// a link" rather than guessing a URL.
const ENTITY_TO_SEARCH_TYPE: Partial<Record<AuditEntity, SearchResultType>> = {
  Invoice: "invoice",
  Quotation: "quotation",
  PurchaseDocument: "purchase",
  BankTransaction: "bank_transaction",
  JournalEntry: "journal_entry",
  Customer: "customer",
  LedgerAccount: "ledger_account",
};

export function buildActivityHref(entity: AuditEntity, entityId: string, isStaff: boolean): string | null {
  const type = ENTITY_TO_SEARCH_TYPE[entity];
  if (!type) return null;
  return buildResultHref(type, entityId, isStaff);
}

// Verb (the part of `action` after the first dot) -> past-tense label.
// Built directly from the actual `action` strings passed to logAudit() at
// every current call site (see lib/auditLog.ts's header comment for the
// full list) — nothing here was invented ahead of the real data.
const VERB_LABEL: Record<string, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  book: "booked",
  status_change: "status changed",
  line_booking: "line items booked",
  upload: "uploaded",
  convert: "converted",
  send: "sent",
  reopen: "reopened",
  respond: "responded to",
  resolve: "resolved",
  import: "imported",
  reconcile: "reconciled",
};

export function verbLabel(action: string): string {
  const verb = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  return VERB_LABEL[verb] ?? verb.replace(/_/g, " ");
}

export function actionLabel(action: string): string {
  const label = verbLabel(action);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function entityLabel(entity: string): string {
  return ENTITY_LABEL[entity as AuditEntity] ?? entity;
}

// A short, human sentence for one audit entry. Falls back to
// "<Entity> <verb>" for any action not explicitly covered here — so a
// future call site that adds a new action still renders something sensible
// instead of "undefined".
export function describeActivity(entity: string, action: string): string {
  const label = entityLabel(entity);
  const verb = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  switch (`${entity}.${verb}`) {
    case "Invoice.status_change":
      return "Invoice status changed";
    case "Invoice.line_booking":
      return "Invoice line items booked";
    case "Quotation.convert":
      return "Quotation converted to invoice";
    case "Quotation.send":
      return "Quotation sent";
    case "PurchaseDocument.upload":
      return "Purchase document uploaded";
    case "PurchaseDocument.book":
      return "Purchase document booked";
    case "BankTransaction.import":
      return "Bank transactions imported";
    case "BankTransaction.reconcile":
      return "Bank transaction reconciled";
    case "ExceptionItem.resolve":
      return "Exception resolved";
    case "ExceptionItem.reopen":
      return "Exception reopened";
    case "ExceptionItem.respond":
      return "Exception responded to";
    default:
      return `${label} ${verbLabel(action)}`;
  }
}

export const ROLE_LABEL: Record<string, string> = {
  client: "Client",
  bookkeeper: "Accountant",
  admin: "Admin",
};

export function actorLabel(userRole: string | null, userName: string | null): string {
  if (userName) return userName;
  if (userRole) return ROLE_LABEL[userRole] ?? userRole;
  return "System";
}

// Best-effort amount to surface next to the entry (e.g. "€1,250.00"), read
// from whichever of the JSON snapshots actually carries a numeric total —
// matches the fields real call sites already log (total / totalAmount /
// amount). Never invents a value: returns null when none of the known
// fields are present.
export function extractAmountLabel(
  after: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null
): string | null {
  const candidates = [after?.total, after?.totalAmount, after?.amount, metadata?.total];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return formatCurrency(c);
  }
  return null;
}

// Groups items (already sorted newest-first) into "Today" / "Yesterday" /
// a short date label — same pattern as groupByDate() in NotificationBell.tsx.
export function groupByDay<T extends { createdAt: string }>(items: T[]): { label: string; items: T[] }[] {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  const groups: { label: string; items: T[] }[] = [];
  let currentKey: string | null = null;
  let currentItems: T[] = [];

  const labelFor = (dateKey: string) => {
    if (dateKey === today) return "Today";
    if (dateKey === yesterday) return "Yesterday";
    return new Date(dateKey).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  for (const item of items) {
    const key = item.createdAt.split("T")[0];
    if (key !== currentKey) {
      if (currentKey !== null) groups.push({ label: labelFor(currentKey), items: currentItems });
      currentKey = key;
      currentItems = [];
    }
    currentItems.push(item);
  }
  if (currentKey !== null) groups.push({ label: labelFor(currentKey), items: currentItems });

  return groups;
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

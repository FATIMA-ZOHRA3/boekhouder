// ═══════════════════════════════════════════════════════════════════════════
// Accounting Control Center — data aggregation & normalization
// ═══════════════════════════════════════════════════════════════════════════
// Pure functions, no React/DOM. This file turns the THREE existing signal
// sources the app already has —
//
//   1. GET /api/exceptions               (formal ExceptionItem records,
//                                          already severity-scored by
//                                          src/lib/exceptionSeverity.ts)
//   2. GET /api/exceptions/suggestions    (missing-receipt candidates,
//                                          deterministic rule, not yet
//                                          persisted as exceptions)
//   3. GET /api/exceptions/inconsistencies (unpaid/VAT/unexplained-credit
//                                          candidates, same "suggest only"
//                                          philosophy)
//
// — into one normalized list of ControlCenterItem, grouped into the four
// visual columns the Control Center displays. NOTHING here re-implements
// exception detection or severity scoring: formal exceptions reuse
// `computeExceptionSeverity` directly, and the two suggestion endpoints
// (which carry no persisted severity of their own) are triaged with a
// small, explicit, documented rule-type → column table below — not a new
// scoring engine.
// ═══════════════════════════════════════════════════════════════════════════

import {
  computeExceptionSeverity,
  type ExceptionSeverity,
} from "@/lib/exceptionSeverity";

// --- Input shapes (mirror the JSON already returned by the three routes) ---

export interface ExceptionItemInput {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string;
  status: string; // waiting | responded | resolved
  invoiceId: string | null;
  purchaseDocId: string | null;
  bankTransactionId: string | null;
  createdAt: string;
  amount?: number | null;
  severity?: ExceptionSeverity;
}

export interface MissingDocSuggestionInput {
  bankTransactionId: string;
  userId: string;
  userName: string;
  amount: number;
  transactionDate: string;
  description: string;
  counterparty: string | null;
  daysUnmatched: number;
  suggestedTitle: string;
  suggestedDescription: string;
}

export interface InconsistencySuggestionInput {
  ruleType: "unpaid_no_bank_match" | "vat_arithmetic_mismatch" | "unexplained_bank_credit";
  userId: string;
  userName: string;
  invoiceId?: string;
  bankTransactionId?: string;
  title: string;
  description: string;
  suggestedTitle: string;
  suggestedDescription: string;
}

// --- Output shape ---

export type ControlCenterColumn = "critical" | "needs_review" | "pending" | "resolved";
export type ControlCenterItemType = "bank" | "invoice" | "purchase" | "vat" | "accounting" | "ai" | "other";
export type ControlCenterStatus = "open" | "in_progress" | "resolved";

export interface ControlCenterItem {
  id: string;
  column: ControlCenterColumn;
  title: string;
  description: string;
  itemType: ControlCenterItemType;
  status: ControlCenterStatus;
  /** ISO date string, when the underlying signal has one. */
  occurredAt: string | null;
  /** Short human reference to the linked record, e.g. "Invoice #A1B2C3". */
  entityLabel: string | null;
  /** Where this signal came from — shown as a small tag on the card. */
  source: string;
  /** Financial amount, when resolvable, for display only. */
  amount: number | null;
  /** Plain navigation CTA — used for items that are already a real ExceptionItem. */
  cta: { label: string; href: string } | null;
  /**
   * Turns this suggestion into a real ExceptionItem via POST /api/exceptions.
   * Only set for items that are NOT yet persisted (missing-doc and
   * inconsistency suggestions) — formal exceptions (from mapExceptionToItem)
   * already exist, so this is null for those and `cta` is used instead.
   */
  createAction: {
    label: string;
    payload: {
      userId: string;
      type: string;
      title: string;
      description: string;
      invoiceId?: string;
      bankTransactionId?: string;
    };
  } | null;
}

export const COLUMN_ORDER: ControlCenterColumn[] = ["critical", "needs_review", "pending", "resolved"];

export const COLUMN_META: Record<
  ControlCenterColumn,
  { label: string; emoji: string; badgeClass: string; dotClass: string; emptyTitle: string; emptyBody: string }
> = {
  critical: {
    label: "Critical",
    emoji: "🔴",
    badgeClass: "bg-red-50 text-red-700 border border-red-200",
    dotClass: "bg-red-500",
    emptyTitle: "No critical issues",
    emptyBody: "Everything looks good here.",
  },
  needs_review: {
    label: "Needs Review",
    emoji: "🟠",
    badgeClass: "bg-orange-50 text-orange-700 border border-orange-200",
    dotClass: "bg-orange-500",
    emptyTitle: "Nothing needs review",
    emptyBody: "No issues waiting on the accountant right now.",
  },
  pending: {
    label: "Pending",
    emoji: "🟡",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    dotClass: "bg-amber-400",
    emptyTitle: "Nothing pending",
    emptyBody: "No items waiting for validation or action.",
  },
  resolved: {
    label: "Resolved",
    emoji: "🟢",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dotClass: "bg-emerald-500",
    emptyTitle: "All clear",
    emptyBody: "No unresolved issues in this category.",
  },
};

export const TYPE_META: Record<ControlCenterItemType, string> = {
  bank: "Bank",
  invoice: "Invoice",
  purchase: "Purchase",
  vat: "VAT",
  accounting: "Accounting",
  ai: "AI",
  other: "Other",
};

export const STATUS_META: Record<ControlCenterStatus, { label: string; badgeClass: string }> = {
  open: { label: "Open", badgeClass: "bg-amber-100 text-amber-700" },
  in_progress: { label: "In progress", badgeClass: "bg-blue-100 text-blue-700" },
  resolved: { label: "Resolved", badgeClass: "bg-emerald-100 text-emerald-700" },
};

// Maps the existing 4-tier severity (src/lib/exceptionSeverity.ts) onto the
// Control Center's 4 visual columns. This is exactly the mapping requested:
// critical→Critical, high→Needs Review, medium→Pending, low→Resolved/OK.
// Resolved ExceptionItems always score 0 ("low") in computeExceptionSeverity,
// so real resolved items and genuinely low-priority open items naturally
// land in the same "healthy" column — the item's own status badge still
// shows the true state (Open / In progress / Resolved) so nothing is hidden.
export function severityToColumn(severity: ExceptionSeverity): ControlCenterColumn {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "needs_review";
    case "medium":
      return "pending";
    case "low":
    default:
      return "resolved";
  }
}

function exceptionStatusToControlCenterStatus(status: string): ControlCenterStatus {
  if (status === "resolved") return "resolved";
  if (status === "responded") return "in_progress";
  return "open";
}

function shortRef(id: string): string {
  return `#${id.slice(-6).toUpperCase()}`;
}

function formatCurrencyEUR(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

// --- Mappers: one existing signal → one ControlCenterItem ---

export function mapExceptionToItem(e: ExceptionItemInput): ControlCenterItem {
  const severity = e.severity ?? computeExceptionSeverity(e);
  const itemType: ControlCenterItemType = e.bankTransactionId
    ? "bank"
    : e.purchaseDocId
    ? "purchase"
    : e.invoiceId
    ? "invoice"
    : "other";
  const entityId = e.bankTransactionId || e.purchaseDocId || e.invoiceId;
  const entityLabel = entityId
    ? `${itemType === "bank" ? "Bank transaction" : itemType === "purchase" ? "Purchase" : "Invoice"}: ${shortRef(entityId)}`
    : null;

  const sectionHref =
    itemType === "bank" ? "/bookkeeper?section=bank" :
    itemType === "purchase" ? "/bookkeeper?section=purchases" :
    itemType === "invoice" ? "/bookkeeper?section=sales" :
    "/bookkeeper?section=exceptions";

  return {
    id: `exception:${e.id}`,
    column: severityToColumn(severity),
    title: e.title,
    description: e.description,
    itemType,
    status: exceptionStatusToControlCenterStatus(e.status),
    occurredAt: e.createdAt,
    entityLabel,
    source: "Exception",
    amount: e.amount ?? null,
    cta:
      e.status === "resolved"
        ? null
        : e.status === "responded"
        ? { label: "Resolve", href: "/bookkeeper?section=exceptions" }
        : { label: "Review", href: sectionHref },
    createAction: null,
  };
}

export function mapMissingDocSuggestionToItem(s: MissingDocSuggestionInput): ControlCenterItem {
  // Reuses the exact same severity engine real "missing_document" exceptions
  // get — the only difference is this one hasn't been turned into a formal
  // ExceptionItem yet.
  const severity = computeExceptionSeverity({
    type: "missing_document",
    status: "waiting",
    createdAt: s.transactionDate,
    amount: s.amount,
  });

  return {
    id: `missing-doc:${s.bankTransactionId}`,
    column: severityToColumn(severity),
    title: s.suggestedTitle,
    description: `${formatCurrencyEUR(s.amount)} payment (${s.description}${s.counterparty ? `, ${s.counterparty}` : ""}) has been unmatched for ${s.daysUnmatched} day${s.daysUnmatched === 1 ? "" : "s"}.`,
    itemType: "purchase",
    status: "open",
    occurredAt: s.transactionDate,
    entityLabel: `Bank transaction: ${shortRef(s.bankTransactionId)}`,
    source: "Missing document detector",
    amount: s.amount,
    cta: null,
    createAction: {
      label: "Create",
      payload: {
        userId: s.userId,
        type: "missing_document",
        title: s.suggestedTitle,
        description: s.suggestedDescription,
        bankTransactionId: s.bankTransactionId,
      },
    },
  };
}

// Rule-type → column triage for inconsistency suggestions. These carry no
// date/amount field to run through computeExceptionSeverity (only baked into
// their description text), so — per the brief's "if a better mapping exists,
// use it" — they get a small explicit table instead of a fabricated score.
// unexplained_bank_credit: unexplained incoming money, direct cash risk → Critical
// unpaid_no_bank_match:    invoice marked paid without proof → Needs Review
// vat_arithmetic_mismatch: invoice calculation error → Needs Review
const INCONSISTENCY_COLUMN: Record<InconsistencySuggestionInput["ruleType"], ControlCenterColumn> = {
  unexplained_bank_credit: "critical",
  unpaid_no_bank_match: "needs_review",
  vat_arithmetic_mismatch: "needs_review",
};

const INCONSISTENCY_TYPE: Record<InconsistencySuggestionInput["ruleType"], ControlCenterItemType> = {
  unexplained_bank_credit: "bank",
  unpaid_no_bank_match: "invoice",
  vat_arithmetic_mismatch: "vat",
};

const INCONSISTENCY_CTA_LABEL: Record<InconsistencySuggestionInput["ruleType"], string> = {
  unexplained_bank_credit: "Match",
  unpaid_no_bank_match: "Validate",
  vat_arithmetic_mismatch: "Validate",
};

// Maps each rule type to one of the exception `type` values the rest of the
// app already understands (see CreateExceptionDrawer in
// src/app/bookkeeper/exceptions/page.tsx: "missing_document" | "status_unclear").
// None of these three rules is a missing document, so they all land on the
// generic "status_unclear" type — computeExceptionSeverity doesn't special-case
// it, which is correct: these aren't scored higher/lower by type, only by age/
// amount/status, same as before.
const INCONSISTENCY_EXCEPTION_TYPE: Record<InconsistencySuggestionInput["ruleType"], string> = {
  unexplained_bank_credit: "status_unclear",
  unpaid_no_bank_match: "status_unclear",
  vat_arithmetic_mismatch: "status_unclear",
};

export function mapInconsistencyToItem(s: InconsistencySuggestionInput): ControlCenterItem {
  const itemType = INCONSISTENCY_TYPE[s.ruleType];
  const entityId = s.invoiceId || s.bankTransactionId || null;
  const entityLabel = entityId
    ? `${itemType === "bank" ? "Bank transaction" : "Invoice"}: ${shortRef(entityId)}`
    : null;

  return {
    id: `inconsistency:${s.ruleType}:${s.invoiceId || s.bankTransactionId}`,
    column: INCONSISTENCY_COLUMN[s.ruleType],
    title: s.title,
    description: s.description,
    itemType,
    status: "open",
    occurredAt: null,
    entityLabel,
    source: "Inconsistency detector",
    amount: null,
    cta: null,
    createAction: {
      label: INCONSISTENCY_CTA_LABEL[s.ruleType],
      payload: {
        userId: s.userId,
        type: INCONSISTENCY_EXCEPTION_TYPE[s.ruleType],
        title: s.suggestedTitle,
        description: s.suggestedDescription,
        invoiceId: s.invoiceId,
        bankTransactionId: s.bankTransactionId,
      },
    },
  };
}

// --- Top-level builder ---

export function buildControlCenterItems(input: {
  exceptions: ExceptionItemInput[];
  missingDocSuggestions: MissingDocSuggestionInput[];
  inconsistencySuggestions: InconsistencySuggestionInput[];
}): ControlCenterItem[] {
  return [
    ...input.exceptions.map(mapExceptionToItem),
    ...input.missingDocSuggestions.map(mapMissingDocSuggestionToItem),
    ...input.inconsistencySuggestions.map(mapInconsistencyToItem),
  ];
}

export function groupByColumn(items: ControlCenterItem[]): Record<ControlCenterColumn, ControlCenterItem[]> {
  const grouped: Record<ControlCenterColumn, ControlCenterItem[]> = {
    critical: [],
    needs_review: [],
    pending: [],
    resolved: [],
  };
  for (const item of items) grouped[item.column].push(item);
  for (const col of COLUMN_ORDER) {
    grouped[col].sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || ""));
  }
  return grouped;
}

export function matchesSearch(item: ControlCenterItem, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    item.title.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    (item.entityLabel ? item.entityLabel.toLowerCase().includes(q) : false)
  );
}

export function formatCurrency(amount: number): string {
  return formatCurrencyEUR(amount);
}

export function formatDate(dateStr: string): string {
  const datePart = dateStr.split("T")[0];
  const parts = datePart.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

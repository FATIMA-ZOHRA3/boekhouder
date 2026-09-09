import { prisma } from "./prisma";

// ═══════════════════════════════════════════════════════════════════════════
// Audit Log
// ═══════════════════════════════════════════════════════════════════════════
// Answers: WHO did WHAT, WHEN, on WHICH object, and (when relevant) what
// changed. Deliberately does NOT log reads (GET requests) or trivial
// lookups — only state-changing actions on the entities below. See
// prisma/schema.prisma's AuditLog model for the storage shape and
// prisma/migrations/20260823220000_add_audit_log for the migration.
//
// Convention for `action`: "<entity, lowercase>.<verb>", e.g.
// "invoice.create", "invoice.delete", "exception.resolve", "bank.reconcile".
// Kept as a plain string rather than a closed union of every entity×verb
// pair (that would be ~40 literals to maintain for marginal typo-safety);
// `entity` below IS a closed union, which catches the more common mistake
// (auditing the wrong kind of record) at compile time.
//
// Call sites currently wired: invoice create/update/delete/book, quotation
// create, exception resolve/respond, bank reconcile. See the report for
// which sensitive actions are NOT wired yet.
// ═══════════════════════════════════════════════════════════════════════════

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

export interface LogAuditParams {
  /** null for system/cron-initiated actions (e.g. recurring invoice processing) */
  userId: string | null;
  userRole?: string | null;
  action: string;
  entity: AuditEntity;
  entityId: string;
  /** Snapshot before the change, when relevant. Plain object — not pre-serialized. */
  before?: unknown;
  /** Snapshot after the change, when relevant. Plain object — not pre-serialized. */
  after?: unknown;
  metadata?: Record<string, unknown>;
}

// Defensive redaction in case a caller passes a full row (e.g. a User) that
// happens to carry a secret field — the caller shouldn't have to remember
// to strip these every time.
const SENSITIVE_KEYS = new Set(["passwordHash", "password", "token", "acceptToken"]);

function redact(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
  const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (SENSITIVE_KEYS.has(key)) clone[key] = "[redacted]";
  }
  return JSON.stringify(clone);
}

/**
 * Records one audit entry. Never throws: a failed audit write must not fail
 * the business action it's documenting (e.g. an invoice must still be
 * creatable even if the audit table is briefly unreachable). Failures are
 * logged to stderr instead, so they're visible in server logs without
 * surfacing to the end user as "could not create invoice".
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        userRole: params.userRole ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: redact(params.before),
        after: redact(params.after),
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (err) {
    console.error("[auditLog] failed to write audit entry", {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      err,
    });
  }
}

/** Full history for one record — e.g. the "Activity" tab on an invoice detail page. */
export async function getAuditLogForEntity(entity: AuditEntity, entityId: string) {
  return prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
  });
}

/** Recent activity, optionally filtered by user and/or entity type. */
export async function getRecentAuditLogs(filters: { userId?: string; entity?: AuditEntity; limit?: number } = {}) {
  return prisma.auditLog.findMany({
    where: {
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.entity && { entity: filters.entity }),
    },
    orderBy: { createdAt: "desc" },
    take: filters.limit ?? 50,
  });
}

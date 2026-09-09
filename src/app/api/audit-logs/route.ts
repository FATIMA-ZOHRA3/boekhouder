import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import type { AuditEntity } from "@/lib/auditLog";
import { describeActivity, actorLabel, extractAmountLabel, buildActivityHref } from "@/lib/auditActivity";

// GET /api/audit-logs?clientId=...&entity=...&action=...&q=...&cursor=...&limit=20
//
// Phase 6 spec, Step 3 ("Create an API only if necessary"): no existing route
// already exposes AuditLog data (checked — see the final report), so this is
// a new, small, purpose-built endpoint. It reuses the same authorization and
// administration-scoping shape as GET /api/search (Phase 5) rather than
// inventing a different one.
//
// SECURITY (Step 12): this is the ONLY place that decides which audit
// entries a given accountant may see — the page never fetches all records
// and filters client-side.
//   - Role: only "bookkeeper" and "admin" may call this at all (via
//     requirePermission's sibling requireRole — Activity has no per-action
//     granularity to gate on, just "is this a staff member", same as the
//     page-level check proxy.ts already does for /bookkeeper/*).
//   - Administration scoping: exactly mirrors TYPE_IS_CLIENT_SCOPED in
//     lib/search.ts. AuditLog has no clientId column of its own (it's a
//     polymorphic entity/entityId pair), so client-scoped entities are
//     matched by first resolving which rows of the owning table (Invoice,
//     Quotation, PurchaseDocument, BankTransaction, Customer, ExceptionItem,
//     RecurringInvoice) belong to the selected administration, then
//     constraining entityId to that set. Firm-wide entities (JournalEntry,
//     LedgerAccount, VatCode, SystemSetting) aren't owned by any one
//     administration and are always included — same reasoning as
//     journal_entry/ledger_account in Global Search.
//   - No administration selected: client-scoped entities are excluded
//     entirely (not merged across administrations) — "better to show
//     nothing than leak data from another admin", the same rule already
//     used by the sidebar counts and Global Search.
export async function GET(request: Request) {
  const session = await getSession();
  const check = await requireRole(session, ["bookkeeper", "admin"]);
  if (!check.ok) return Response.json({ error: check.status === 401 ? "Not logged in" : "Not allowed" }, { status: check.status });

  const { searchParams } = new URL(request.url);
  const requestedClientId = searchParams.get("clientId");
  const clientId = requestedClientId && requestedClientId !== "all" ? requestedClientId : null;

  const entityFilter = searchParams.get("entity") as AuditEntity | null;
  const actionFilter = searchParams.get("action");
  const query = (searchParams.get("q") || "").trim();
  const cursor = searchParams.get("cursor");
  const limit = clampLimit(searchParams.get("limit"));
  // Phase 7: lets a caller (e.g. the Customer Financial Profile page) reuse
  // this same feed narrowed to a specific set of entity ids — that
  // customer's own record plus its invoices — instead of a separate
  // per-entity audit mechanism. Still fully constrained by scopeWhere below,
  // so it can only ever narrow what the caller could already see.
  const entityIdsFilter = (searchParams.get("entityIds") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const scopeWhere = await buildScopeWhere(clientId);

  const filters: Record<string, unknown>[] = [scopeWhere];
  if (entityFilter) filters.push({ entity: entityFilter });
  if (actionFilter) filters.push({ action: actionFilter });
  if (entityIdsFilter.length > 0) filters.push({ entityId: { in: entityIdsFilter } });
  if (query) {
    filters.push({
      OR: [
        { action: { contains: query, mode: "insensitive" } },
        { entityId: { contains: query, mode: "insensitive" } },
        { user: { name: { contains: query, mode: "insensitive" } } },
      ],
    });
  }
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (!Number.isNaN(cursorDate.getTime())) filters.push({ createdAt: { lt: cursorDate } });
  }

  const where = { AND: filters };
  const take = limit + 1;

  // Action options are scoped by entity (when one is selected) so the
  // dropdown never offers e.g. "Reconciled" while "Invoice" is the active
  // entity filter — entity options themselves stay scoped by administration
  // only, so switching entities never hides the other entity choices.
  const actionsWhere = entityFilter ? { AND: [scopeWhere, { entity: entityFilter }] } : scopeWhere;

  const [rows, availableEntities, availableActions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.auditLog.findMany({ where: scopeWhere, distinct: ["entity"], select: { entity: true }, take: 20 }),
    prisma.auditLog.findMany({ where: actionsWhere, distinct: ["action"], select: { action: true }, take: 50 }),
  ]);

  const hasMore = rows.length > limit;
  const trimmed = rows.slice(0, limit);

  const items = trimmed.map((row) => {
    const after = row.after ? (JSON.parse(row.after) as Record<string, unknown>) : null;
    const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null;
    const entity = row.entity as AuditEntity;
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      entity,
      action: row.action,
      entityId: row.entityId,
      description: describeActivity(entity, row.action),
      actorName: actorLabel(row.userRole, row.user?.name ?? null),
      amountLabel: extractAmountLabel(after, metadata),
      href: buildActivityHref(entity, row.entityId, true),
    };
  });

  return Response.json({
    items,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].createdAt.toISOString() : null,
    hasMore,
    clientId,
    // Only entities/actions that actually appear in this scope — Step 5/6
    // of the spec: "Only display categories that correspond to actual
    // AuditLog data" / "Do NOT invent action types".
    availableEntities: availableEntities.map((r) => r.entity as AuditEntity),
    availableActions: availableActions.map((r) => r.action),
  });
}

function clampLimit(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : 20;
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, 100);
}

// Entities not owned by any single administration — always visible
// regardless of which (or whether an) administration is selected. Kept as a
// plain list here (not in lib/auditActivity.ts's ENTITY_IS_CLIENT_SCOPED)
// only because building the Prisma `where` needs it right next to the
// queries below; the source of truth for the true/false itself is the
// exported map, this just reads it once.
const FIRM_WIDE_ENTITIES: AuditEntity[] = ["JournalEntry", "LedgerAccount", "VatCode", "SystemSetting"];

async function buildScopeWhere(clientId: string | null) {
  if (!clientId) {
    // No administration selected: only firm-wide entries are safe to show.
    return { entity: { in: FIRM_WIDE_ENTITIES } };
  }

  const [invoices, quotations, purchases, bankTx, customers, exceptions, recurring] = await Promise.all([
    prisma.invoice.findMany({ where: { clientId }, select: { id: true } }),
    prisma.quotation.findMany({ where: { clientId }, select: { id: true } }),
    prisma.purchaseDocument.findMany({ where: { userId: clientId }, select: { id: true } }),
    prisma.bankTransaction.findMany({ where: { userId: clientId }, select: { id: true } }),
    prisma.customer.findMany({ where: { userId: clientId }, select: { id: true } }),
    prisma.exceptionItem.findMany({ where: { userId: clientId }, select: { id: true } }),
    prisma.recurringInvoice.findMany({ where: { clientId }, select: { id: true } }),
  ]);

  return {
    OR: [
      { entity: "Invoice", entityId: { in: invoices.map((r) => r.id) } },
      { entity: "Quotation", entityId: { in: quotations.map((r) => r.id) } },
      { entity: "PurchaseDocument", entityId: { in: purchases.map((r) => r.id) } },
      { entity: "BankTransaction", entityId: { in: bankTx.map((r) => r.id) } },
      { entity: "Customer", entityId: { in: customers.map((r) => r.id) } },
      { entity: "ExceptionItem", entityId: { in: exceptions.map((r) => r.id) } },
      { entity: "RecurringInvoice", entityId: { in: recurring.map((r) => r.id) } },
      { entity: "User", entityId: clientId },
      { entity: { in: FIRM_WIDE_ENTITIES } },
    ],
  };
}

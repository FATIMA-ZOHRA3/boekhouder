import { prisma } from "./prisma";
import type { Role, Session } from "./auth";

export type { Role };

// ---------------------------------------------------------------------------
// Pilier 2 — Sécurité / Permissions
// ---------------------------------------------------------------------------
// Single source of truth for "which role can do which action". This replaces the
// `if (!user || (user.role !== "bookkeeper" && user.role !== "admin"))` block that was
// copy-pasted across 27 API routes before this change.
//
// Deliberately NOT a database table: with exactly 3 fixed roles and no requirement (yet)
// for per-user or per-administration custom roles, a typed constant here is simpler to
// read, review and keep in sync with the code than a Permission/RolePermission schema
// would be. If custom roles are ever needed, this is the file to replace with a DB-backed
// lookup — every call site already goes through requirePermission(), so nothing else
// would need to change.
//
// IMPORTANT: this file only answers "is this role allowed to do X at all?". It does NOT
// replace the existing "own data vs. all data" scoping already present in routes (e.g.
// `effectiveClientId = isStaff ? requestedClientId : me.id` in invoices/route.ts). That
// scoping logic is untouched by Pilier 2 and stays exactly as it was.
// ---------------------------------------------------------------------------

export type Permission =
  // Invoices
  | "invoice.read"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "invoice.send"
  | "invoice.book"
  // Quotations
  | "quotation.read"
  | "quotation.create"
  | "quotation.update"
  | "quotation.delete"
  | "quotation.send"
  // Customers
  | "customer.read"
  | "customer.create"
  | "customer.update"
  | "customer.delete"
  // Purchases
  | "purchase.read"
  | "purchase.upload"
  | "purchase.update"
  | "purchase.delete"
  // Banking
  | "bank.read"
  | "bank.import"
  | "bank.reconcile"
  // Cash (manual cash-book entries — read+manage merged, same reasoning as
  // accounting above: only staff touch this today)
  | "cash.manage"
  // Accounting (read+manage merged: no role today distinguishes them — see the audit
  // notes for Pilier 2, section "permissions redondantes")
  | "ledger.manage"
  | "journal.manage"
  | "vat.manage"
  // Exceptions
  // Note: `exception.create` was added during implementation (not in the originally
  // presented 41-permission matrix) after re-reading exceptions/route.ts: POST there is
  // staff-only and is a distinct action from `exception.respond` (the client-side action
  // in [id]/respond). Omitting it would have meant either mis-mapping it onto
  // `exception.respond` or leaving it unmigrated — both worse than a one-permission
  // addition. See the final summary for the corrected count.
  | "exception.read"
  | "exception.create"
  | "exception.respond"
  // Tasks
  | "task.read"
  | "task.manage"
  // Notifications (read+manage merged, same reasoning as accounting above)
  | "notification.manage"
  // Conversations
  | "conversation.read"
  | "conversation.create"
  // AI — split by who actually calls each route:
  // - `ai.use`: the 5 staff-only Groq-backed routes (draft-reply, scan-purchase-document,
  //   suggest-category, summarize-conversation, summarize-task).
  // - `ai.tax-concept.explain`: explain-tax-concept, confirmed open to every authenticated
  //   role (client included) by design — see that route's own file-header comment.
  | "ai.use"
  | "ai.tax-concept.explain"
  // The voice-invoice parser (client-facing, used only from /client/invoices/new) was
  // previously reachable by anyone with a session at all — no permission check — because
  // "ai.use" is staff-only and would have wrongly blocked the client who is its only real
  // caller. Giving it its own permission closes that gap without changing who can use it.
  | "ai.voice-invoice.use"
  // The mobile Q&A assistant (POST /api/ai/assistant) needs its own permission for
  // exactly the same reason as ai.voice-invoice.use above: "ai.use" is staff-only,
  // but the assistant is meant for clients asking about their own data too, not
  // just staff. Reusing "ai.use" would also incorrectly widen client access to the
  // five unrelated staff-only Groq routes it gates.
  | "ai.assistant.use"
  // Recurring invoices
  | "recurring.read"
  | "recurring.manage"
  // Line templates (read+manage merged)
  | "template.manage"
  // Admin
  | "admin.settings"
  | "admin.users.manage"
  | "admin.stats.read"
  | "admin.tax-concepts.manage";

// Permissions granted to an authenticated "client" role. Where the underlying route also
// scopes by ownership (customer.userId, invoice.clientId, etc.), that scoping is untouched
// and still lives in the route itself — this list only says the action is reachable at all.
const CLIENT_PERMISSIONS: Permission[] = [
  "invoice.read",
  "invoice.create",
  "invoice.send",
  "quotation.read",
  "quotation.create",
  "quotation.send",
  "customer.read",
  "customer.create",
  "customer.update",
  "purchase.read",
  "purchase.upload",
  "task.read",
  "notification.manage",
  "conversation.read",
  "conversation.create",
  "ai.tax-concept.explain",
  "ai.voice-invoice.use",
  "ai.assistant.use",
  "recurring.read",
];

// Permissions shared by "bookkeeper" and "admin" (the "staff" set). Factored out once so
// the two role entries below don't duplicate ~30 lines.
const STAFF_PERMISSIONS: Permission[] = [
  "invoice.read",
  "invoice.create",
  "invoice.update",
  "invoice.delete",
  "invoice.send",
  "invoice.book",
  "quotation.read",
  "quotation.create",
  "quotation.update",
  "quotation.delete",
  "quotation.send",
  "customer.read",
  "customer.create",
  "customer.update",
  "customer.delete",
  "purchase.read",
  "purchase.upload",
  "purchase.update",
  "purchase.delete",
  "bank.read",
  "bank.import",
  "bank.reconcile",
  "cash.manage",
  "ledger.manage",
  "journal.manage",
  "vat.manage",
  "exception.read",
  "exception.create",
  "exception.respond",
  "task.read",
  "task.manage",
  "notification.manage",
  "conversation.read",
  "conversation.create",
  "ai.use",
  "ai.tax-concept.explain",
  "ai.assistant.use",
  "recurring.read",
  "recurring.manage",
  "template.manage",
];

const ADMIN_ONLY_PERMISSIONS: Permission[] = [
  "admin.settings",
  "admin.users.manage",
  "admin.stats.read",
  "admin.tax-concepts.manage",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  client: CLIENT_PERMISSIONS,
  bookkeeper: STAFF_PERMISSIONS,
  admin: [...STAFF_PERMISSIONS, ...ADMIN_ONLY_PERMISSIONS],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// ---------------------------------------------------------------------------
// requireRole / requirePermission
// ---------------------------------------------------------------------------
// Both load the user exactly once (Session already carries `role`, so no extra `role`
// lookup is needed — only a lightweight `id` lookup is kept for routes that need the full
// User row, e.g. to check `id === admin.id` when preventing self-deletion).
//
// - requireRole: coarse-grained, role-only. Used in proxy.ts (page-level protection, before
//   any specific action is known) and in the few routes where "any staff member" is truly
//   all that's being checked.
// - requirePermission: fine-grained, action-specific. Used in API routes so a future
//   intermediate role (e.g. a "junior bookkeeper" without bank.reconcile) could be added
//   without touching the routes themselves — only ROLE_PERMISSIONS would change.
// ---------------------------------------------------------------------------

export type PermissionCheck =
  | { ok: true; user: { id: string; role: Role } }
  | { ok: false; status: 401 | 403 };

export async function requireRole(
  session: Session | null,
  allowed: Role[]
): Promise<PermissionCheck> {
  if (!session) return { ok: false, status: 401 };
  if (!allowed.includes(session.role)) return { ok: false, status: 403 };
  return { ok: true, user: { id: session.userId, role: session.role } };
}

export async function requirePermission(
  session: Session | null,
  permission: Permission
): Promise<PermissionCheck> {
  if (!session) return { ok: false, status: 401 };
  if (!roleHasPermission(session.role, permission)) return { ok: false, status: 403 };
  return { ok: true, user: { id: session.userId, role: session.role } };
}

// A handful of existing routes load the *full* User row after the role check (e.g. to read
// `admin.id` for a self-deletion guard, or fields beyond id/role). This variant does that in
// one query instead of two, while keeping the same PermissionCheck shape as above so callers
// don't need two different code paths.
export async function requirePermissionWithUser(
  session: Session | null,
  permission: Permission
) {
  if (!session) return { ok: false as const, status: 401 as const };
  if (!roleHasPermission(session.role, permission)) return { ok: false as const, status: 403 as const };
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { ok: false as const, status: 401 as const };
  return { ok: true as const, user };
}

export async function requireRoleWithUser(session: Session | null, allowed: Role[]) {
  if (!session) return { ok: false as const, status: 401 as const };
  if (!allowed.includes(session.role)) return { ok: false as const, status: 403 as const };
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { ok: false as const, status: 401 as const };
  return { ok: true as const, user };
}

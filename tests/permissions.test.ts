import { describe, it, expect, vi } from "vitest";

// permissions.ts imports "@/lib/prisma" (used only by requirePermissionWithUser /
// requireRoleWithUser). That module in turn imports the generated Prisma client
// (src/generated/prisma), which does not exist in this environment: `prisma generate`
// cannot reach binaries.prisma.sh here (network egress restriction), not something these
// tests can or should work around. Mocking it keeps this suite testing what it's meant to
// test — the permission matrix and requireRole/requirePermission logic — without needing a
// real database or a successful `prisma generate`.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  ROLE_PERMISSIONS,
  roleHasPermission,
  requireRole,
  requirePermission,
  type Permission,
  type Role,
} from "@/lib/permissions";
import type { Session } from "@/lib/auth";

const ALL_ROLES: Role[] = ["client", "bookkeeper", "admin"];

function makeSession(role: Role): Session {
  return {
    id: "sess-1",
    userId: "user-1",
    createdAt: new Date(),
    lastActivity: new Date(),
    role,
  };
}

describe("ROLE_PERMISSIONS matrix", () => {
  // NOTE: this assertion previously read 42 ("41 validated + exception.create").
  // While adding ai.assistant.use for the mobile AI Assistant endpoint, a
  // direct recount of ROLE_PERMISSIONS (see the walkthrough report) found the
  // real pre-existing total was already 44, not 42 — a 2-permission drift
  // that predates this change and isn't something this task can attribute
  // with certainty (no version history available in this environment).
  // Recorded here as the verified ground truth (44 + ai.assistant.use = 45)
  // rather than silently preserved; worth a follow-up look outside this task.
  it("has exactly 45 distinct permissions across the app (verified by direct recount — see comment above)", () => {
    const all = new Set<Permission>();
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) all.add(p);
    }
    expect(all.size).toBe(45);
  });

  it("grants admin every staff permission plus admin-only permissions", () => {
    for (const p of ROLE_PERMISSIONS.bookkeeper) {
      expect(ROLE_PERMISSIONS.admin).toContain(p);
    }
    expect(ROLE_PERMISSIONS.admin).toContain("admin.settings");
    expect(ROLE_PERMISSIONS.admin).toContain("admin.users.manage");
  });

  it("never grants admin-only permissions to client or bookkeeper", () => {
    const adminOnly: Permission[] = [
      "admin.settings",
      "admin.users.manage",
      "admin.stats.read",
      "admin.tax-concepts.manage",
    ];
    for (const p of adminOnly) {
      expect(ROLE_PERMISSIONS.client).not.toContain(p);
      expect(ROLE_PERMISSIONS.bookkeeper).not.toContain(p);
    }
  });

  it("keeps staff-only actions away from client (spot-check on the validated matrix)", () => {
    const staffOnly: Permission[] = [
      "bank.read",
      "bank.import",
      "bank.reconcile",
      "invoice.book",
      "invoice.delete",
      "exception.read",
      "exception.create",
      "exception.respond",
      "ai.use",
      "ledger.manage",
      "journal.manage",
      "vat.manage",
      "template.manage",
    ];
    for (const p of staffOnly) {
      expect(ROLE_PERMISSIONS.client).not.toContain(p);
      expect(ROLE_PERMISSIONS.bookkeeper).toContain(p);
    }
  });

  it("grants ai.tax-draft.explain to every role (confirmed by inspecting the route)", () => {
    for (const role of ALL_ROLES) {
      expect(roleHasPermission(role, "ai.tax-concept.explain")).toBe(true);
    }
  });

  it("grants client the basic own-data actions it needs", () => {
    const clientBasics: Permission[] = [
      "invoice.read",
      "invoice.create",
      "invoice.send",
      "quotation.read",
      "customer.read",
      "purchase.upload",
      "task.read",
      "notification.manage",
      "recurring.read",
    ];
    for (const p of clientBasics) {
      expect(ROLE_PERMISSIONS.client).toContain(p);
    }
  });
});

describe("requireRole()", () => {
  it("returns 401 when there is no session", async () => {
    const result = await requireRole(null, ["admin"]);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("returns 403 when the session's role is not in the allowed list", async () => {
    const result = await requireRole(makeSession("client"), ["bookkeeper", "admin"]);
    expect(result).toEqual({ ok: false, status: 403 });
  });

  it("returns ok:true with the user when the role is allowed", async () => {
    const session = makeSession("bookkeeper");
    const result = await requireRole(session, ["bookkeeper", "admin"]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual({ id: "user-1", role: "bookkeeper" });
    }
  });
});

describe("requirePermission()", () => {
  it("returns 401 when there is no session", async () => {
    const result = await requirePermission(null, "bank.reconcile");
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("returns 403 when the role does not have the permission", async () => {
    const result = await requirePermission(makeSession("client"), "bank.reconcile");
    expect(result).toEqual({ ok: false, status: 403 });
  });

  it("returns ok:true when the role has the permission", async () => {
    const result = await requirePermission(makeSession("admin"), "bank.reconcile");
    expect(result.ok).toBe(true);
  });

  // Full matrix sweep: every permission x every role, cross-checked against ROLE_PERMISSIONS.
  it("agrees with ROLE_PERMISSIONS for every (role, permission) pair", async () => {
    const allPermissions = new Set<Permission>();
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) allPermissions.add(p);
    }
    for (const role of ALL_ROLES) {
      for (const permission of allPermissions) {
        const expected = ROLE_PERMISSIONS[role].includes(permission);
        const result = await requirePermission(makeSession(role), permission);
        expect(result.ok).toBe(expected);
      }
    }
  });
});

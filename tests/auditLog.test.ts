import { describe, it, expect, vi, beforeEach } from "vitest";

// Same reasoning as the other test files in this suite: the generated Prisma
// client isn't available in this environment, so @/lib/prisma is mocked.
const create = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { create: (...args: unknown[]) => create(...args), findMany: (...args: unknown[]) => findMany(...args) } },
}));

import { logAudit, getAuditLogForEntity, getRecentAuditLogs } from "@/lib/auditLog";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logAudit()", () => {
  it("writes userId, action, entity, entityId as given", async () => {
    create.mockResolvedValue({});
    await logAudit({ userId: "user-1", action: "invoice.create", entity: "Invoice", entityId: "inv-1" });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        action: "invoice.create",
        entity: "Invoice",
        entityId: "inv-1",
        before: null,
        after: null,
        metadata: null,
      }),
    });
  });

  it("accepts a null userId for system/cron-initiated actions", async () => {
    create.mockResolvedValue({});
    await logAudit({ userId: null, action: "invoice.book", entity: "Invoice", entityId: "inv-1" });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: null }) });
  });

  it("serializes before/after snapshots to JSON", async () => {
    create.mockResolvedValue({});
    await logAudit({
      userId: "user-1",
      action: "invoice.update",
      entity: "Invoice",
      entityId: "inv-1",
      before: { status: "draft" },
      after: { status: "sent" },
    });
    const data = create.mock.calls[0][0].data;
    expect(JSON.parse(data.before)).toEqual({ status: "draft" });
    expect(JSON.parse(data.after)).toEqual({ status: "sent" });
  });

  it("redacts sensitive fields (passwordHash) even if a full row is passed", async () => {
    create.mockResolvedValue({});
    await logAudit({
      userId: "admin-1",
      action: "user.update",
      entity: "User",
      entityId: "user-2",
      before: { email: "a@b.com", passwordHash: "$2b$10$secret" },
      after: { email: "a@b.com", passwordHash: "$2b$10$newsecret" },
    });
    const data = create.mock.calls[0][0].data;
    expect(JSON.parse(data.before).passwordHash).toBe("[redacted]");
    expect(JSON.parse(data.after).passwordHash).toBe("[redacted]");
    expect(JSON.parse(data.before).email).toBe("a@b.com");
  });

  it("serializes metadata separately from before/after", async () => {
    create.mockResolvedValue({});
    await logAudit({
      userId: "user-1",
      action: "bank.reconcile",
      entity: "BankTransaction",
      entityId: "tx-1",
      metadata: { matchScore: 0.84, reason: "amount+reference+date" },
    });
    const data = create.mock.calls[0][0].data;
    expect(JSON.parse(data.metadata)).toEqual({ matchScore: 0.84, reason: "amount+reference+date" });
  });

  it("never throws when the write fails — the caller's action must not fail because audit logging did", async () => {
    create.mockRejectedValue(new Error("DB unreachable"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      logAudit({ userId: "user-1", action: "invoice.create", entity: "Invoice", entityId: "inv-1" })
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("getAuditLogForEntity()", () => {
  it("queries by entity + entityId, most recent first", async () => {
    findMany.mockResolvedValue([]);
    await getAuditLogForEntity("Invoice", "inv-1");
    expect(findMany).toHaveBeenCalledWith({
      where: { entity: "Invoice", entityId: "inv-1" },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("getRecentAuditLogs()", () => {
  it("defaults to the 50 most recent entries with no filters", async () => {
    findMany.mockResolvedValue([]);
    await getRecentAuditLogs();
    expect(findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("filters by userId and entity when provided", async () => {
    findMany.mockResolvedValue([]);
    await getRecentAuditLogs({ userId: "user-1", entity: "Invoice", limit: 10 });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", entity: "Invoice" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });
});

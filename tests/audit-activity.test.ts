import { describe, it, expect, vi, beforeEach } from "vitest";

// Same reasoning as tests/search.test.ts / tests/permissions.test.ts: no generated
// Prisma client in this sandbox (no network access to binaries.prisma.sh), so
// @/lib/prisma and @/lib/auth are mocked to exercise the route's real
// authorization + administration-scoping logic without a live database. Every
// spy lives inside the vi.mock factory itself (not in an outer const) for the
// same hoisting reason documented in tests/search.test.ts.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    quotation: { findMany: vi.fn() },
    purchaseDocument: { findMany: vi.fn() },
    bankTransaction: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
    exceptionItem: { findMany: vi.fn() },
    recurringInvoice: { findMany: vi.fn() },
  },
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));

import { prisma } from "@/lib/prisma";
import {
  describeActivity,
  actorLabel,
  extractAmountLabel,
  buildActivityHref,
  groupByDay,
  verbLabel,
  ENTITY_IS_CLIENT_SCOPED,
} from "@/lib/auditActivity";

const auditLog = prisma.auditLog as unknown as { findMany: ReturnType<typeof vi.fn> };
const invoice = prisma.invoice as unknown as { findMany: ReturnType<typeof vi.fn> };
const quotation = prisma.quotation as unknown as { findMany: ReturnType<typeof vi.fn> };
const purchaseDocument = prisma.purchaseDocument as unknown as { findMany: ReturnType<typeof vi.fn> };
const bankTransaction = prisma.bankTransaction as unknown as { findMany: ReturnType<typeof vi.fn> };
const customer = prisma.customer as unknown as { findMany: ReturnType<typeof vi.fn> };
const exceptionItem = prisma.exceptionItem as unknown as { findMany: ReturnType<typeof vi.fn> };
const recurringInvoice = prisma.recurringInvoice as unknown as { findMany: ReturnType<typeof vi.fn> };

function session(role: "client" | "bookkeeper" | "admin") {
  return { id: "sess-1", userId: "user-1", createdAt: new Date(), lastActivity: new Date(), role };
}

// ---------------------------------------------------------------------------
// Pure logic (no server call involved) — src/lib/auditActivity.ts
// ---------------------------------------------------------------------------

describe("describeActivity — real (entity, action) pairs from the actual logAudit call sites", () => {
  it("covers every action string currently fired by the app (see lib/auditLog.ts call sites)", () => {
    expect(describeActivity("Invoice", "invoice.create")).toBe("Invoice created");
    expect(describeActivity("Invoice", "invoice.delete")).toBe("Invoice deleted");
    expect(describeActivity("Invoice", "invoice.book")).toBe("Invoice booked");
    expect(describeActivity("Invoice", "invoice.status_change")).toBe("Invoice status changed");
    expect(describeActivity("Invoice", "invoice.line_booking")).toBe("Invoice line items booked");
    expect(describeActivity("Quotation", "quotation.convert")).toBe("Quotation converted to invoice");
    expect(describeActivity("Quotation", "quotation.send")).toBe("Quotation sent");
    expect(describeActivity("PurchaseDocument", "purchase.upload")).toBe("Purchase document uploaded");
    expect(describeActivity("PurchaseDocument", "purchase.book")).toBe("Purchase document booked");
    expect(describeActivity("BankTransaction", "bank.import")).toBe("Bank transactions imported");
    expect(describeActivity("BankTransaction", "bank.reconcile")).toBe("Bank transaction reconciled");
    expect(describeActivity("ExceptionItem", "exception.resolve")).toBe("Exception resolved");
    expect(describeActivity("ExceptionItem", "exception.reopen")).toBe("Exception reopened");
    expect(describeActivity("ExceptionItem", "exception.respond")).toBe("Exception responded to");
  });

  it("falls back to '<Entity> <verb>' for an action with no dedicated sentence, instead of inventing one", () => {
    expect(describeActivity("JournalEntry", "journal.create")).toBe("Accounting created");
    expect(describeActivity("JournalEntry", "journal.reopen")).toBe("Accounting reopened");
  });

  it("never throws on an unrecognized verb — degrades to the raw verb with underscores replaced", () => {
    expect(verbLabel("Invoice.something_new")).toBe("something new");
  });
});

describe("actorLabel", () => {
  it("prefers the actor's real name when available", () => {
    expect(actorLabel("bookkeeper", "Jane Doe")).toBe("Jane Doe");
  });
  it("falls back to a role label when there is no name", () => {
    expect(actorLabel("bookkeeper", null)).toBe("Accountant");
    expect(actorLabel("client", null)).toBe("Client");
    expect(actorLabel("admin", null)).toBe("Admin");
  });
  it("falls back to 'System' for a null userId/userRole entry (cron/system actions)", () => {
    expect(actorLabel(null, null)).toBe("System");
  });
});

describe("extractAmountLabel — only ever reads fields real call sites actually log", () => {
  it("reads `total` from the after snapshot", () => {
    expect(extractAmountLabel({ total: 1250 }, null)).toContain("1.250,00");
  });
  it("reads `amount` from metadata when after has nothing numeric", () => {
    expect(extractAmountLabel(null, { total: 42.5 })).toContain("42,50");
  });
  it("returns null rather than inventing a number when none of the known fields are present", () => {
    expect(extractAmountLabel({ status: "sent" }, null)).toBeNull();
    expect(extractAmountLabel(null, null)).toBeNull();
  });
});

describe("buildActivityHref — reuses Global Search's verified routes, never invents a URL", () => {
  it("links entities that have a Global Search equivalent", () => {
    expect(buildActivityHref("Invoice", "inv-1", true)).toBe("/bookkeeper/invoices/inv-1");
    expect(buildActivityHref("PurchaseDocument", "doc-1", true)).toBe("/bookkeeper?section=purchases");
  });
  it("returns null (no link) for entities with no safe destination, per spec Step 10", () => {
    expect(buildActivityHref("ExceptionItem", "exc-1", true)).toBeNull();
    expect(buildActivityHref("User", "u-1", true)).toBeNull();
    expect(buildActivityHref("VatCode", "vat-1", true)).toBeNull();
    expect(buildActivityHref("SystemSetting", "s-1", true)).toBeNull();
    expect(buildActivityHref("RecurringInvoice", "r-1", true)).toBeNull();
  });
});

describe("groupByDay", () => {
  it("groups consecutive same-day items and labels today/yesterday", () => {
    const now = new Date();
    const today = now.toISOString();
    const yesterday = new Date(now.getTime() - 86400000).toISOString();
    const groups = groupByDay([
      { createdAt: today, id: "a" },
      { createdAt: today, id: "b" },
      { createdAt: yesterday, id: "c" },
    ]);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].label).toBe("Yesterday");
    expect(groups[1].items).toHaveLength(1);
  });
});

describe("ENTITY_IS_CLIENT_SCOPED — matches the real schema ownership fields", () => {
  it("firm-wide entities (no clientId/userId column) are not client-scoped", () => {
    expect(ENTITY_IS_CLIENT_SCOPED.JournalEntry).toBe(false);
    expect(ENTITY_IS_CLIENT_SCOPED.LedgerAccount).toBe(false);
    expect(ENTITY_IS_CLIENT_SCOPED.VatCode).toBe(false);
    expect(ENTITY_IS_CLIENT_SCOPED.SystemSetting).toBe(false);
  });
  it("entities owned by one administration are client-scoped", () => {
    expect(ENTITY_IS_CLIENT_SCOPED.Invoice).toBe(true);
    expect(ENTITY_IS_CLIENT_SCOPED.PurchaseDocument).toBe(true);
    expect(ENTITY_IS_CLIENT_SCOPED.BankTransaction).toBe(true);
    expect(ENTITY_IS_CLIENT_SCOPED.Customer).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/audit-logs — auth + administration scoping
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  auditLog.findMany.mockResolvedValue([]);
  invoice.findMany.mockResolvedValue([]);
  quotation.findMany.mockResolvedValue([]);
  purchaseDocument.findMany.mockResolvedValue([]);
  bankTransaction.findMany.mockResolvedValue([]);
  customer.findMany.mockResolvedValue([]);
  exceptionItem.findMany.mockResolvedValue([]);
  recurringInvoice.findMany.mockResolvedValue([]);
});

function req(url: string) {
  return new Request(url);
}

describe("GET /api/audit-logs — authorization", () => {
  it("401s an unauthenticated request", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(null);
    const res = await GET(req("http://localhost/api/audit-logs"));
    expect(res.status).toBe(401);
    expect(auditLog.findMany).not.toHaveBeenCalled();
  });

  it("403s a client-role session — Activity is staff-only", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(session("client"));
    const res = await GET(req("http://localhost/api/audit-logs"));
    expect(res.status).toBe(403);
    expect(auditLog.findMany).not.toHaveBeenCalled();
  });

  it("allows a bookkeeper session", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(session("bookkeeper"));
    const res = await GET(req("http://localhost/api/audit-logs"));
    expect(res.status).toBe(200);
  });

  it("allows an admin session", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(session("admin"));
    const res = await GET(req("http://localhost/api/audit-logs"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/audit-logs — administration scoping", () => {
  it("with no clientId, never queries any client-scoped table and only asks AuditLog for firm-wide entities", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(session("bookkeeper"));
    await GET(req("http://localhost/api/audit-logs"));

    expect(invoice.findMany).not.toHaveBeenCalled();
    expect(quotation.findMany).not.toHaveBeenCalled();
    expect(purchaseDocument.findMany).not.toHaveBeenCalled();
    expect(bankTransaction.findMany).not.toHaveBeenCalled();
    expect(customer.findMany).not.toHaveBeenCalled();
    expect(exceptionItem.findMany).not.toHaveBeenCalled();
    expect(recurringInvoice.findMany).not.toHaveBeenCalled();

    const mainCall = auditLog.findMany.mock.calls.find((c) => c[0]?.orderBy);
    expect(mainCall![0].where).toEqual({
      AND: [{ entity: { in: ["JournalEntry", "LedgerAccount", "VatCode", "SystemSetting"] } }],
    });
  });

  it("with a clientId, resolves owned ids from every client-scoped table before querying AuditLog", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(session("bookkeeper"));
    invoice.findMany.mockResolvedValue([{ id: "inv-1" }]);
    purchaseDocument.findMany.mockResolvedValue([{ id: "doc-1" }]);

    await GET(req("http://localhost/api/audit-logs?clientId=client-a"));

    expect(invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client-a" } }));
    expect(purchaseDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "client-a" } }));
    expect(bankTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "client-a" } }));
    expect(customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "client-a" } }));

    const mainCall = auditLog.findMany.mock.calls.find((c) => c[0]?.orderBy);
    const scope = mainCall![0].where.AND[0];
    expect(scope.OR).toContainEqual({ entity: "Invoice", entityId: { in: ["inv-1"] } });
    expect(scope.OR).toContainEqual({ entity: "PurchaseDocument", entityId: { in: ["doc-1"] } });
    // Firm-wide entities are still included alongside the resolved owned ids.
    expect(scope.OR).toContainEqual({ entity: { in: ["JournalEntry", "LedgerAccount", "VatCode", "SystemSetting"] } });
  });

  it("`clientId=all` is treated the same as no clientId (firm-wide only), matching /api/search's convention", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(session("bookkeeper"));
    await GET(req("http://localhost/api/audit-logs?clientId=all"));
    expect(invoice.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/audit-logs — items shape", () => {
  it("maps a raw AuditLog row to a display-ready item with a human description and no leaked JSON strings", async () => {
    const { GET } = await import("../src/app/api/audit-logs/route");
    mockGetSession.mockResolvedValue(session("bookkeeper"));
    const createdAt = new Date("2026-08-29T14:05:00Z");
    auditLog.findMany.mockImplementation((args: { distinct?: string[] }) => {
      if (args.distinct?.[0] === "entity") return Promise.resolve([{ entity: "Invoice" }]);
      if (args.distinct?.[0] === "action") return Promise.resolve([{ action: "invoice.book" }]);
      return Promise.resolve([
        {
          id: "log-1",
          createdAt,
          entity: "Invoice",
          action: "invoice.book",
          entityId: "inv-1",
          userRole: "bookkeeper",
          user: { name: null },
          after: JSON.stringify({ status: "sent", bookkeepingStatus: "booked", total: 1250 }),
          metadata: null,
        },
      ]);
    });

    const res = await GET(req("http://localhost/api/audit-logs"));
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      id: "log-1",
      entity: "Invoice",
      description: "Invoice booked",
      actorName: "Accountant",
      href: "/bookkeeper/invoices/inv-1",
    });
    expect(data.items[0].amountLabel).toContain("1.250");
    expect(data.availableEntities).toEqual(["Invoice"]);
    expect(data.availableActions).toEqual(["invoice.book"]);
  });
});

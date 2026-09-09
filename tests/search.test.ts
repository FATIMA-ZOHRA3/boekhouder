import { describe, it, expect, vi, beforeEach } from "vitest";

// Same reasoning as tests/permissions.test.ts / tests/ownership-fixes.test.ts / tests/
// auditLog.test.ts: the generated Prisma client isn't available in this sandbox (no
// network access to binaries.prisma.sh), so @/lib/prisma and @/lib/auth are mocked to
// exercise the route's real authorization + scoping logic without a live database.
//
// IMPORTANT (vitest hoisting): vi.mock() factories run the moment the mocked module is
// first imported, which — because this file has a STATIC import of @/lib/search below
// (search.ts -> permissions.ts -> prisma.ts) — can be as early as module evaluation,
// before any later `const` in this file has initialized (a temporal-dead-zone
// ReferenceError; see tests/auditLog.test.ts, which hits the same constraint and solves
// it the same way). So every spy is created *inside* the factory itself (vi.fn() doesn't
// close over anything), and retrieved afterwards through the mocked `prisma` import
// rather than through outer `const`s that the factory would have to close over.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    purchaseDocument: { findMany: vi.fn() },
    bankTransaction: { findMany: vi.fn() },
    quotation: { findMany: vi.fn() },
    journalEntry: { findMany: vi.fn() },
    ledgerAccount: { findMany: vi.fn() },
  },
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

import { prisma } from "@/lib/prisma";
import {
  buildResultHref,
  parseAmountQuery,
  buildCustomerWhere,
  buildInvoiceWhere,
  buildBankTransactionWhere,
  buildJournalEntryWhere,
  buildLedgerAccountWhere,
  normalizeInvoice,
  normalizeBankTransaction,
  isQueryTooShort,
  clampLimit,
  SEARCH_MAX_LIMIT,
} from "@/lib/search";

const customer = prisma.customer as unknown as { findMany: ReturnType<typeof vi.fn> };
const invoice = prisma.invoice as unknown as { findMany: ReturnType<typeof vi.fn> };
const purchaseDocument = prisma.purchaseDocument as unknown as { findMany: ReturnType<typeof vi.fn> };
const bankTransaction = prisma.bankTransaction as unknown as { findMany: ReturnType<typeof vi.fn> };
const quotation = prisma.quotation as unknown as { findMany: ReturnType<typeof vi.fn> };
const journalEntry = prisma.journalEntry as unknown as { findMany: ReturnType<typeof vi.fn> };
const ledgerAccount = prisma.ledgerAccount as unknown as { findMany: ReturnType<typeof vi.fn> };

// ---------------------------------------------------------------------------
// Pure logic (no server call involved) — src/lib/search.ts
// ---------------------------------------------------------------------------

// getSearchableTypes (role -> which entity types it may search) now lives as
// a private helper inside the route (it needs roleHasPermission, which pulls
// in prisma — see the header comment in src/lib/search.ts for why that must
// stay out of this otherwise client-safe module). Its behavior is exercised
// end-to-end below instead, through the real GET handler: "client role"
// tests assert bank/journal/ledger are never even queried, and "staff role"
// tests assert every type is reachable — the same guarantee, verified
// through the actual wiring rather than the helper in isolation.

describe("buildResultHref — every destination is a real, existing route (never invented)", () => {
  it("invoice: dedicated route per portal", () => {
    expect(buildResultHref("invoice", "inv-1", true)).toBe("/bookkeeper/invoices/inv-1");
    expect(buildResultHref("invoice", "inv-1", false)).toBe("/client/invoices/inv-1/view");
  });

  it("customer: staff get the Phase 7 per-customer financial profile page; client portal still has no per-record route, so it lands on the closest real list", () => {
    expect(buildResultHref("customer", "c-1", true)).toBe("/bookkeeper/customers/c-1");
    expect(buildResultHref("customer", "c-1", false)).toBe("/client/customers");
  });

  it("bank_transaction: staff-only, opens the bank section (no id-level deep link exists today)", () => {
    expect(buildResultHref("bank_transaction", "tx-1", true)).toBe("/bookkeeper?section=bank");
  });

  it("ledger_account href matches the sidebar's own href string exactly", () => {
    expect(buildResultHref("ledger_account", "la-1", true)).toBe("/bookkeeper?section=general ledger");
  });
});

describe("parseAmountQuery — bank transaction amount search", () => {
  it("parses plain integers and decimals", () => {
    expect(parseAmountQuery("149")).toBe(149);
    expect(parseAmountQuery("149.50")).toBe(149.5);
  });

  it("accepts a comma decimal separator (EU/Dutch formatting)", () => {
    expect(parseAmountQuery("149,00")).toBe(149);
    expect(parseAmountQuery("1.234,56")).toBeCloseTo(1234.56);
  });

  it("returns null for non-numeric queries so they never leak into an amount filter", () => {
    expect(parseAmountQuery("INV-2026-0045")).toBeNull();
    expect(parseAmountQuery("Microsoft")).toBeNull();
    expect(parseAmountQuery("")).toBeNull();
  });
});

describe("query validation", () => {
  it("1 character is too short, 2 is not (spec Step 6)", () => {
    expect(isQueryTooShort("m")).toBe(true);
    expect(isQueryTooShort("mi")).toBe(false);
  });

  it("clampLimit never exceeds SEARCH_MAX_LIMIT and falls back sanely on garbage input", () => {
    expect(clampLimit("1000")).toBe(SEARCH_MAX_LIMIT);
    expect(clampLimit("abc")).toBeGreaterThan(0);
    expect(clampLimit("-5")).toBeGreaterThan(0);
  });
});

describe("where-builders — the scoping guarantee itself, independent of Prisma/the route", () => {
  it("a client-scoped where ALWAYS pins the given clientId, regardless of the query text", () => {
    const where = buildCustomerWhere("anything at all", "client-a") as { userId?: string };
    expect(where.userId).toBe("client-a");
  });

  it("clientId=null means no ownership filter is added at all (used only for firm-wide types)", () => {
    const where = buildInvoiceWhere("q", null, null, null, null) as Record<string, unknown>;
    expect(where.clientId).toBeUndefined();
  });

  it("journal entries and ledger accounts have no clientId concept — the builders don't accept one", () => {
    const journalWhere = buildJournalEntryWhere("afschrijving", null, null, null) as Record<string, unknown>;
    const ledgerWhere = buildLedgerAccountWhere("8000") as Record<string, unknown>;
    expect(journalWhere.clientId).toBeUndefined();
    expect(ledgerWhere.clientId).toBeUndefined();
  });

  it("bank transaction amount matching only activates for numeric-looking queries", () => {
    const numeric = buildBankTransactionWhere("149", "c-1", 149, null, null, null) as { OR: unknown[] };
    const text = buildBankTransactionWhere("Microsoft", "c-1", null, null, null, null) as { OR: unknown[] };
    expect(numeric.OR.length).toBe(text.OR.length + 1);
  });
});

describe("normalizers — role-correct href embedded in the result item", () => {
  it("normalizeInvoice picks the bookkeeper vs client href based on the isStaff flag", () => {
    const row = { id: "inv-1", invoiceNumber: "INV-2026-0045", customerName: "Microsoft BV", total: 2450, status: "sent" };
    expect(normalizeInvoice(row, true).href).toBe("/bookkeeper/invoices/inv-1");
    expect(normalizeInvoice(row, false).href).toBe("/client/invoices/inv-1/view");
  });

  it("normalizeBankTransaction shows a signed amount so debit/credit is visible at a glance", () => {
    const credit = normalizeBankTransaction({ id: "t1", description: "Microsoft payment", counterparty: null, amount: 149, direction: "credit", status: "new" });
    const debit = normalizeBankTransaction({ id: "t2", description: "Microsoft payment", counterparty: null, amount: 149, direction: "debit", status: "new" });
    expect(credit.metadata).toMatch(/^\+/);
    expect(debit.metadata).toMatch(/^-/);
  });
});

// ---------------------------------------------------------------------------
// GET /api/search — behavioral tests with prisma + auth mocked
// ---------------------------------------------------------------------------

const CLIENT_A = { id: "client-a", role: "client" as const };
const CLIENT_B = { id: "client-b", role: "client" as const };
const BOOKKEEPER = { id: "bk-1", role: "bookkeeper" as const };

function session(u: { id: string; role: string }) {
  return { id: "sess-1", userId: u.id, createdAt: new Date(), lastActivity: new Date(), role: u.role };
}

function req(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return { url: `http://localhost/api/search?${params.toString()}` } as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [customer, invoice, purchaseDocument, bankTransaction, quotation, journalEntry, ledgerAccount]) {
    m.findMany.mockResolvedValue([]);
  }
});

describe("GET /api/search — auth", () => {
  it("401 with no session", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(null);
    const res = await GET(req({ q: "Microsoft" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/search — Step 6: never hits the database for a too-short query", () => {
  it("empty query", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    const res = await GET(req({ q: "" }));
    const body = await res.json();
    expect(body.groups).toEqual([]);
    expect(customer.findMany).not.toHaveBeenCalled();
  });

  it("1-character query", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    await GET(req({ q: "m" }));
    expect(customer.findMany).not.toHaveBeenCalled();
    expect(invoice.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/search — client role: scope and permission enforcement", () => {
  it("never queries staff-only entity types, even though the route function itself could", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    await GET(req({ q: "Microsoft" }));
    expect(bankTransaction.findMany).not.toHaveBeenCalled();
    expect(journalEntry.findMany).not.toHaveBeenCalled();
    expect(ledgerAccount.findMany).not.toHaveBeenCalled();
  });

  it("queries its own client-scoped types", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    await GET(req({ q: "Microsoft" }));
    expect(customer.findMany).toHaveBeenCalled();
    expect(invoice.findMany).toHaveBeenCalled();
    expect(purchaseDocument.findMany).toHaveBeenCalled();
    expect(quotation.findMany).toHaveBeenCalled();
  });

  it("SECURITY: a client cannot see another client's data by passing a foreign clientId", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    await GET(req({ q: "Microsoft", clientId: CLIENT_B.id }));
    expect(customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: CLIENT_A.id }) })
    );
    expect(invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: CLIENT_A.id }) })
    );
  });
});

describe("GET /api/search — staff role: administration scoping", () => {
  it("without an active administration, client-scoped types are skipped but accounting stays searchable", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    ledgerAccount.findMany.mockResolvedValue([
      { id: "la-1", accountNumber: "8000", name: "Omzet", category: "Omzet", accountType: "revenue" },
    ]);
    const res = await GET(req({ q: "omzet" }));
    const body = await res.json();
    expect(customer.findMany).not.toHaveBeenCalled();
    expect(bankTransaction.findMany).not.toHaveBeenCalled();
    expect(ledgerAccount.findMany).toHaveBeenCalled();
    expect(body.groups.some((g: { type: string }) => g.type === "ledger_account")).toBe(true);
  });

  it("with an active administration, every entity type is queried (client-scoped ones scoped to it)", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    const activeAdminId = "admin-co-1";
    await GET(req({ q: "Microsoft", clientId: activeAdminId }));
    for (const m of [customer, invoice, purchaseDocument, bankTransaction, quotation, journalEntry, ledgerAccount]) {
      expect(m.findMany).toHaveBeenCalled();
    }
    expect(customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: activeAdminId }) })
    );
    expect(bankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: activeAdminId }) })
    );
  });
});

describe("GET /api/search — result shaping", () => {
  it("hasMore is true and items are trimmed back to the requested limit when there's an extra row", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `c${i}`,
      name: `Customer ${i}`,
      email: null,
      vatNumber: null,
      city: null,
    }));
    customer.findMany.mockResolvedValue(rows); // limit=2 requested below -> take=3 -> 3 returned means hasMore
    const res = await GET(req({ q: "customer", clientId: "adm-1", types: "customer", limit: "2" }));
    const body = await res.json();
    const group = body.groups.find((g: { type: string }) => g.type === "customer");
    expect(group.hasMore).toBe(true);
    expect(group.items).toHaveLength(2);
  });

  it("types with zero matches are omitted from groups entirely, not returned empty", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    invoice.findMany.mockResolvedValue([
      { id: "i1", invoiceNumber: "INV-1", customerName: "Microsoft BV", total: 100, status: "sent" },
    ]);
    const res = await GET(req({ q: "Microsoft", clientId: "adm-1" }));
    const body = await res.json();
    expect(body.groups.map((g: { type: string }) => g.type)).toEqual(["invoice"]);
  });

  it("the `types` filter narrows which entities are queried at all", async () => {
    const { GET } = await import("../src/app/api/search/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    await GET(req({ q: "Microsoft", clientId: "adm-1", types: "invoice" }));
    expect(invoice.findMany).toHaveBeenCalled();
    expect(customer.findMany).not.toHaveBeenCalled();
    expect(purchaseDocument.findMany).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking strategy as tests/audit-activity.test.ts / tests/ownership-fixes.test.ts:
// no generated Prisma client in this sandbox, so @/lib/prisma and @/lib/auth are mocked
// to exercise the route's real auth + aggregation logic without a live database.

const user = { findUnique: vi.fn() };
const customer = { findUnique: vi.fn() };
const invoice = { findMany: vi.fn(), update: vi.fn() };
const payment = { findMany: vi.fn() };

vi.mock("@/lib/prisma", () => ({ prisma: { user, customer, invoice, payment } }));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));

function session() {
  return { id: "sess-1", userId: "user-1", createdAt: new Date(), lastActivity: new Date(), role: "bookkeeper" as const };
}

function makeInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inv-1",
    clientId: "admin-1",
    customerId: "cust-1",
    invoiceNumber: "INV-1001",
    date: "2026-08-01",
    dueDate: "2026-08-15",
    customerName: "Acme BV",
    total: 1000,
    paidAmount: 0,
    status: "sent",
    isCredit: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  payment.findMany.mockResolvedValue([]);
  invoice.update.mockResolvedValue({});
});

async function callRoute(id: string) {
  const { GET } = await import("../src/app/api/customers/[id]/financial-profile/route");
  return GET(new Request(`http://localhost/api/customers/${id}/financial-profile`), { params: Promise.resolve({ id }) });
}

describe("GET /api/customers/[id]/financial-profile — authorization", () => {
  it("401s when not logged in", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await callRoute("cust-1");
    expect(res.status).toBe(401);
    expect(customer.findUnique).not.toHaveBeenCalled();
  });

  it("404s when the customer does not exist", async () => {
    mockGetSession.mockResolvedValue(session());
    user.findUnique.mockResolvedValue({ id: "user-1", role: "bookkeeper" });
    customer.findUnique.mockResolvedValue(null);
    const res = await callRoute("cust-missing");
    expect(res.status).toBe(404);
  });

  it("404s a client-role user trying to view a customer they don't own (no ownership leak)", async () => {
    mockGetSession.mockResolvedValue({ ...session(), role: "client" });
    user.findUnique.mockResolvedValue({ id: "user-1", role: "client" });
    customer.findUnique.mockResolvedValue({ id: "cust-1", userId: "someone-else", name: "Acme BV", email: null, phone: null });
    invoice.findMany.mockResolvedValue([]);
    const res = await callRoute("cust-1");
    expect(res.status).toBe(404);
  });

  it("allows the owning client (their own debtor record)", async () => {
    mockGetSession.mockResolvedValue({ ...session(), role: "client" });
    user.findUnique.mockResolvedValue({ id: "user-1", role: "client" });
    customer.findUnique.mockResolvedValue({ id: "cust-1", userId: "user-1", name: "Acme BV", email: null, phone: null });
    invoice.findMany.mockResolvedValue([]);
    const res = await callRoute("cust-1");
    expect(res.status).toBe(200);
  });

  it("allows a bookkeeper regardless of which administration owns the customer", async () => {
    mockGetSession.mockResolvedValue(session());
    user.findUnique.mockResolvedValue({ id: "user-1", role: "bookkeeper" });
    customer.findUnique.mockResolvedValue({ id: "cust-1", userId: "admin-1", name: "Acme BV", email: null, phone: null });
    invoice.findMany.mockResolvedValue([]);
    const res = await callRoute("cust-1");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/customers/[id]/financial-profile — invoice matching", () => {
  it("queries invoices by customerId OR (unlinked + matching customerName), scoped to the owning administration", async () => {
    mockGetSession.mockResolvedValue(session());
    user.findUnique.mockResolvedValue({ id: "user-1", role: "bookkeeper" });
    customer.findUnique.mockResolvedValue({ id: "cust-1", userId: "admin-1", name: "Acme BV", email: null, phone: null });
    invoice.findMany.mockResolvedValue([]);

    await callRoute("cust-1");

    expect(invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId: "admin-1",
          OR: [{ customerId: "cust-1" }, { customerId: null, customerName: "Acme BV" }],
        },
      })
    );
  });
});

describe("GET /api/customers/[id]/financial-profile — financial aggregation (real data, no invented numbers)", () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(session());
    user.findUnique.mockResolvedValue({ id: "user-1", role: "bookkeeper" });
    customer.findUnique.mockResolvedValue({ id: "cust-1", userId: "admin-1", name: "Acme BV", email: "a@x.com", phone: "0600" });
  });

  it("computes totals matching the same status buckets as getFiscalSummary (lib/data.ts)", async () => {
    const past = "2020-01-01"; // always in the past, deterministic regardless of test run date
    invoice.findMany.mockResolvedValue([
      makeInvoice({ id: "paid-1", status: "paid", total: 1000, paidAmount: 1000 }),
      makeInvoice({ id: "sent-1", status: "sent", dueDate: "2999-01-01", total: 500, paidAmount: 200 }),
      makeInvoice({ id: "overdue-1", status: "sent", dueDate: past, total: 300, paidAmount: 0 }), // should auto-flip to overdue
      makeInvoice({ id: "credit-1", isCredit: true, total: -100, paidAmount: 0, status: "paid" }),
    ]);

    const res = await callRoute("cust-1");
    const data = await res.json();

    // The invoice that was still "sent" past its due date gets promoted to
    // "overdue" and persisted — same side effect as getFiscalSummary().
    expect(invoice.update).toHaveBeenCalledWith({ where: { id: "overdue-1" }, data: { status: "overdue" } });

    // totals exclude the credit note, matching the app-wide !isCredit convention
    expect(data.summary.totalInvoiced).toBe(1000 + 500 + 300);
    expect(data.summary.totalPaid).toBe(1000 + 200 + 0);
    expect(data.summary.outstanding).toBe(500 - 200 + (300 - 0)); // sent + overdue
    expect(data.summary.overdue).toBe(300 - 0);
    expect(data.summary.invoiceCount).toBe(3); // credit note excluded from the count
  });

  it("never fabricates a number when there is no data — all zero for a customer with no invoices", async () => {
    invoice.findMany.mockResolvedValue([]);
    const res = await callRoute("cust-1");
    const data = await res.json();
    expect(data.summary).toEqual({ totalInvoiced: 0, totalPaid: 0, outstanding: 0, overdue: 0, invoiceCount: 0 });
    expect(data.invoices).toEqual([]);
    expect(data.payments).toEqual([]);
  });

  it("returns real payment rows (date, amount, invoice number) alongside the summary", async () => {
    invoice.findMany.mockResolvedValue([makeInvoice({ id: "inv-1", status: "paid", paidAmount: 1000, total: 1000 })]);
    payment.findMany.mockResolvedValue([
      { id: "pay-1", date: "2026-08-29", amount: 1250, invoice: { invoiceNumber: "INV-1045" } },
    ]);

    const res = await callRoute("cust-1");
    const data = await res.json();

    expect(data.payments).toEqual([{ id: "pay-1", date: "2026-08-29", amount: 1250, invoiceNumber: "INV-1045" }]);
    expect(data.auditEntityIds).toContain("cust-1");
    expect(data.auditEntityIds).toContain("inv-1");
  });
});

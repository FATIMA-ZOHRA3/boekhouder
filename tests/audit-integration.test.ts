import { describe, it, expect, vi, beforeEach } from "vitest";

// Same mocking strategy as the rest of this suite (see tests/ownership-fixes.test.ts):
// no generated Prisma client in this environment, so @/lib/prisma is mocked. @/lib/auditLog
// is ALSO mocked here (as a spy) — this file checks that the right routes call logAudit with
// the right shape; tests/auditLog.test.ts already covers the service's own behavior
// (serialization, redaction, and — importantly — that it never throws and so can never break
// the caller's business action, which is why that specific property isn't re-tested per-route
// here: it's guaranteed once, at the one place all these call sites go through).

const user = { findUnique: vi.fn() };
const invoice = { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), updateMany: vi.fn() };
const quotation = { findUnique: vi.fn(), update: vi.fn() };
const exceptionItem = { findUnique: vi.fn(), update: vi.fn() };
const bankTransaction = { updateMany: vi.fn() };
const purchaseDocument = { updateMany: vi.fn() };

vi.mock("@/lib/prisma", () => ({
  prisma: { user, invoice, quotation, exceptionItem, bankTransaction, purchaseDocument },
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));

const logAudit = vi.fn();
vi.mock("@/lib/auditLog", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));

vi.mock("@/lib/notifications", () => ({
  notificationTemplates: {
    invoiceBooked: vi.fn(() => ({ catch: vi.fn() })),
    bankReconciled: vi.fn(() => ({ catch: vi.fn() })),
  },
}));

vi.mock("@/lib/data", () => ({
  getInvoice: vi.fn(async (id: string) => ({ id })),
  updateInvoiceBookkeepingStatus: vi.fn(),
  updateInvoiceStatus: vi.fn(async (id: string, status: string) => ({ id, status, bookkeepingStatus: "pending", total: 100 })),
}));

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => true) }));

const BOOKKEEPER = { id: "bk-1", role: "bookkeeper" as const };
const CLIENT_A = { id: "client-a", role: "client" as const };
const CLIENT_B = { id: "client-b", role: "client" as const };

function session(u: { id: string; role: string }) {
  return { id: "sess-1", userId: u.id, createdAt: new Date(), lastActivity: new Date(), role: u.role };
}
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("audit trail — real routes call logAudit with the right shape", () => {
  it("bank/reconcile writes one audit entry per reconciled transaction", async () => {
    const { POST } = await import("../src/app/api/bank/reconcile/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    user.findUnique.mockResolvedValue(BOOKKEEPER);
    invoice.updateMany.mockResolvedValue({ count: 1 });
    bankTransaction.updateMany.mockResolvedValue({ count: 2 });
    const req = { json: async () => ({ invoiceIds: ["inv-1"], bankTransactionIds: ["tx-1", "tx-2"] }) };
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledTimes(2);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "bank.reconcile", entity: "BankTransaction", entityId: "tx-1" }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "bank.reconcile", entity: "BankTransaction", entityId: "tx-2" }));
  });

  it("changing invoice status writes an invoice.status_change entry", async () => {
    const { PATCH } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    user.findUnique.mockResolvedValue(BOOKKEEPER);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_A.id, status: "draft", bookkeepingStatus: "pending", total: 100 });
    const req = { json: async () => ({ status: "sent" }) };
    await PATCH(req as never, params("inv-1"));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "invoice.status_change", entity: "Invoice", entityId: "inv-1" }));
  });

  it("deleting an invoice writes an invoice.delete entry with a before snapshot", async () => {
    const { DELETE } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    user.findUnique.mockResolvedValue(BOOKKEEPER);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_A.id, invoiceNumber: "202600001", status: "draft", total: 100 });
    invoice.delete.mockResolvedValue({});
    await DELETE({} as never, params("inv-1"));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "invoice.delete",
      entity: "Invoice",
      entityId: "inv-1",
      before: expect.objectContaining({ invoiceNumber: "202600001" }),
    }));
  });

  it("a non-owner client is denied AND no audit entry is written (denied actions aren't audited as if they happened)", async () => {
    const { DELETE } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_B.id });
    const res = (await DELETE({} as never, params("inv-1")))!;
    expect(res.status).toBe(404);
    expect(invoice.delete).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("an unauthenticated request is denied AND no audit entry is written", async () => {
    const { DELETE } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(null);
    const res = (await DELETE({} as never, params("inv-1")))!;
    expect(res.status).toBe(401);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("resolving an exception writes an exception.resolve entry", async () => {
    const { PATCH } = await import("../src/app/api/exceptions/[id]/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    exceptionItem.findUnique.mockResolvedValue({ id: "exc-1", status: "waiting", userId: "client-a" });
    user.findUnique.mockResolvedValue(BOOKKEEPER);
    exceptionItem.update.mockResolvedValue({ id: "exc-1", status: "resolved" });
    const req = { json: async () => ({ status: "resolved" }) };
    await PATCH(req as never, params("exc-1"));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "exception.resolve", entity: "ExceptionItem", entityId: "exc-1" }));
  });

  it("reopening an exception writes an exception.reopen entry", async () => {
    const { PATCH } = await import("../src/app/api/exceptions/[id]/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    exceptionItem.findUnique.mockResolvedValue({ id: "exc-1", status: "resolved", userId: "client-a" });
    user.findUnique.mockResolvedValue(BOOKKEEPER);
    exceptionItem.update.mockResolvedValue({ id: "exc-1", status: "waiting" });
    const req = { json: async () => ({ status: "waiting" }) };
    await PATCH(req as never, params("exc-1"));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "exception.reopen", entity: "ExceptionItem", entityId: "exc-1" }));
  });

  it("sending a quotation writes a quotation.send entry with the recipient in metadata", async () => {
    const { POST } = await import("../src/app/api/quotations/[id]/send/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    quotation.findUnique.mockResolvedValue({
      id: "q-1", clientId: CLIENT_A.id, quotationNumber: "OFF-1", status: "draft",
      items: [], subtotal: 100, vatAmount: 21, total: 121, validUntil: "2026-09-01",
    });
    quotation.update.mockResolvedValue({});
    const req = { json: async () => ({ to: "customer@example.com", subject: "Quote", message: "Hi" }) };
    await POST(req as never, params("q-1"));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "quotation.send",
      entity: "Quotation",
      entityId: "q-1",
      metadata: { to: "customer@example.com" },
    }));
  });
});

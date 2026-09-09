import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Same reasoning as tests/permissions.test.ts and tests/proxy.test.ts: the generated
// Prisma client isn't available in this environment (prisma generate needs network
// access this sandbox doesn't have — see report), so both @/lib/prisma and @/lib/auth
// are mocked to exercise the routes' real authorization logic without a live database.
//
// This suite targets the routes found with NO auth check at all during the Pilier 2
// follow-up audit (see report: "Sécurité / Permissions"): the entire quotations resource,
// and most of the invoices/[id]/* sub-routes. Two representative route families
// (invoices/[id] and quotations, quotations/[id]) get full behavioral coverage; the
// remaining fixed files get a static regression check (same style as
// tests/routes-migration.test.ts) so a future edit can't silently drop the check again.

const user = { findUnique: vi.fn() };
const invoice = { findUnique: vi.fn(), delete: vi.fn() };
const quotation = { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() };

const auditLog = { create: vi.fn().mockResolvedValue({}) };

vi.mock("@/lib/prisma", () => ({
  prisma: { user, invoice, quotation, auditLog },
}));

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/data", () => ({
  getInvoice: vi.fn(async (id: string) => ({ id })),
  updateInvoiceBookkeepingStatus: vi.fn(),
  updateInvoiceStatus: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  notificationTemplates: { invoiceBooked: vi.fn(() => ({ catch: vi.fn() })) },
}));

const CLIENT_A = { id: "client-a", role: "client" as const };
const CLIENT_B = { id: "client-b", role: "client" as const };
const BOOKKEEPER = { id: "bk-1", role: "bookkeeper" as const };

function session(u: { id: string; role: string }) {
  return { id: "sess-1", userId: u.id, createdAt: new Date(), lastActivity: new Date(), role: u.role };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invoices/[id] — was fully unauthenticated (GET/PATCH/DELETE)", () => {
  it("GET: 401 with no session", async () => {
    const { GET } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(null);
    const res = (await GET({} as never, params("inv-1")))!;
    expect(res.status).toBe(401);
  });

  it("GET: 404 when the invoice belongs to a different client (not 403 — avoids leaking existence)", async () => {
    const { GET } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_B.id });
    const res = (await GET({} as never, params("inv-1")))!;
    expect(res.status).toBe(404);
  });

  it("GET: 200 when the client owns the invoice", async () => {
    const { GET } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_A.id });
    const res = (await GET({} as never, params("inv-1")))!;
    expect(res.status).toBe(200);
  });

  it("GET: 200 for staff regardless of ownership", async () => {
    const { GET } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(BOOKKEEPER));
    user.findUnique.mockResolvedValue(BOOKKEEPER);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_B.id });
    const res = (await GET({} as never, params("inv-1")))!;
    expect(res.status).toBe(200);
  });

  it("DELETE: a client cannot delete another client's invoice", async () => {
    const { DELETE } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_B.id });
    const res = (await DELETE({} as never, params("inv-1")))!;
    expect(res.status).toBe(404);
    expect(invoice.delete).not.toHaveBeenCalled();
  });

  it("PATCH: a client (owner or not) cannot call PATCH — staff-only in the current UI (see route comment)", async () => {
    const { PATCH } = await import("../src/app/api/invoices/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    invoice.findUnique.mockResolvedValue({ id: "inv-1", clientId: CLIENT_A.id });
    const req = { json: async () => ({ status: "sent" }) };
    const res = (await PATCH(req as never, params("inv-1")))!;
    expect(res.status).toBe(403);
  });
});

describe("quotations — was fully unauthenticated (list/create/detail)", () => {
  it("GET /quotations: a client only ever sees their own, even if a different clientId is requested", async () => {
    const { GET } = await import("../src/app/api/quotations/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    const findMany = vi.fn().mockResolvedValue([]);
    (quotation as unknown as { findMany: typeof findMany }).findMany = findMany;
    const req = { nextUrl: { searchParams: new URLSearchParams({ clientId: CLIENT_B.id }) } };
    await GET(req as never);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: CLIENT_A.id } }));
  });

  it("POST /quotations: a client cannot create a quotation for another clientId", async () => {
    const { POST } = await import("../src/app/api/quotations/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    const create = vi.fn().mockResolvedValue({ id: "q-1", items: [] });
    (quotation as unknown as { create: typeof create }).create = create;
    const req = { json: async () => ({ clientId: CLIENT_B.id, items: [] }) };
    await POST(req as never);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clientId: CLIENT_A.id }) }));
  });

  it("GET /quotations/[id]: 404 for a non-owner client", async () => {
    const { GET } = await import("../src/app/api/quotations/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    quotation.findUnique.mockResolvedValue({ id: "q-1", clientId: CLIENT_B.id });
    const res = (await GET({} as never, params("q-1")))!;
    expect(res.status).toBe(404);
  });

  it("DELETE /quotations/[id]: the owning client CAN delete their own (needed for the existing delete+recreate edit flow)", async () => {
    const { DELETE } = await import("../src/app/api/quotations/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    quotation.findUnique.mockResolvedValue({ id: "q-1", clientId: CLIENT_A.id });
    quotation.delete.mockResolvedValue({});
    const res = (await DELETE({} as never, params("q-1")))!;
    expect(res.status).toBe(200);
  });

  it("DELETE /quotations/[id]: a client cannot delete someone else's quotation", async () => {
    const { DELETE } = await import("../src/app/api/quotations/[id]/route");
    mockGetSession.mockResolvedValue(session(CLIENT_A));
    user.findUnique.mockResolvedValue(CLIENT_A);
    quotation.findUnique.mockResolvedValue({ id: "q-1", clientId: CLIENT_B.id });
    const res = (await DELETE({} as never, params("q-1")))!;
    expect(res.status).toBe(404);
    expect(quotation.delete).not.toHaveBeenCalled();
  });
});

// Static regression net (same style as tests/routes-migration.test.ts) for every other
// file touched by this fix, so a future edit can't silently remove the check again
// without a test failing — without needing a full behavioral mock per file.
describe("other previously-unauthenticated routes — static non-regression check", () => {
  const ROOT = path.resolve(__dirname, "..");
  const FIXED_ROUTES = [
    "src/app/api/quotations/[id]/convert/route.ts",
    "src/app/api/quotations/[id]/copy/route.ts",
    "src/app/api/quotations/[id]/send/route.ts",
    "src/app/api/quotations/[id]/notes/route.ts",
    "src/app/api/invoices/[id]/notes/route.ts",
    "src/app/api/invoices/[id]/credit/route.ts",
    "src/app/api/invoices/[id]/payments/route.ts",
    "src/app/api/invoices/[id]/copy/route.ts",
    "src/app/api/invoices/[id]/send/route.ts",
    "src/app/api/invoices/[id]/remind/route.ts",
  ];

  function read(relPath: string): string {
    return readFileSync(path.join(ROOT, relPath), "utf-8");
  }

  it.each(FIXED_ROUTES)("calls getSession() and checks for a null session: %s", (relPath) => {
    const src = read(relPath);
    expect(src).toContain('from "@/lib/auth"');
    expect(src).toMatch(/getSession\(\)/);
    expect(src).toMatch(/!session/);
  });

  it.each(FIXED_ROUTES)("scopes access by ownership (isStaff / clientId check): %s", (relPath) => {
    const src = read(relPath);
    expect(src).toMatch(/isStaff/);
  });

  const CRON_ROUTES = [
    "src/app/api/reminders/process/route.ts",
    "src/app/api/recurring-invoices/process/route.ts",
  ];

  it.each(CRON_ROUTES)("gates the cron job behind requireCronSecret: %s", (relPath) => {
    const src = read(relPath);
    expect(src).toContain('from "@/lib/cronAuth"');
    expect(src).toMatch(/requireCronSecret\(request\)/);
  });
});

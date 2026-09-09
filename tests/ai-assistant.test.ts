import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// Environment: same constraint as tests/permissions.test.ts — the generated
// Prisma client isn't available in this sandbox (prisma generate can't reach
// binaries.prisma.sh here), so @/lib/prisma is mocked. Additionally, the
// real getSession() in @/lib/auth calls next/headers' cookies()/headers(),
// which require an active Next.js request-dispatch context that only exists
// under `next dev`/`next start` — not when a handler is imported and called
// directly, as this test does. @/lib/auth is mocked for that reason so each
// scenario below can set an exact, known session instead of faking cookies.
// Everything downstream of that — permission enforcement (real
// requirePermission/roleHasPermission from @/lib/permissions), rate
// limiting (real checkAiRateLimitDetailed), request validation, data
// scoping, and response shape — is the route's real, unmocked code.
// All data below is synthetic/fabricated — no real user data.
// ─────────────────────────────────────────────────────────────────────────

process.env.GROQ_API_KEY = "test-key-not-real";

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));

// Deliberately expose ONLY read methods (findMany/findUnique). If the route
// ever tried to call .update/.create/.delete on any model, that call would
// throw "is not a function" immediately — a structural guarantee, not just
// a prompt instruction, that this endpoint cannot write anything.
const invoiceFindMany = vi.fn();
const purchaseFindMany = vi.fn();
const bankFindMany = vi.fn();
const userFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findMany: (...args: unknown[]) => invoiceFindMany(...args) },
    purchaseDocument: { findMany: (...args: unknown[]) => purchaseFindMany(...args) },
    bankTransaction: { findMany: (...args: unknown[]) => bankFindMany(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

import { POST } from "@/app/api/ai/assistant/route";
import { roleHasPermission } from "@/lib/permissions";

const CLIENT_SESSION = { id: "sess-1", userId: "client-1", createdAt: new Date(), lastActivity: new Date(), role: "client" as const };
const STAFF_SESSION = { id: "sess-2", userId: "staff-1", createdAt: new Date(), lastActivity: new Date(), role: "bookkeeper" as const };

const FAKE_INVOICES = [
  { invoiceNumber: "INV-0001", date: "2026-08-01", dueDate: "2026-08-15", customerName: "Sample Customer BV", total: 121.0, paidAmount: 0, status: "overdue", isCredit: false },
];
const FAKE_PURCHASES = [
  { supplierName: "Sample Supplier NV", documentDate: "2026-08-05", dueDate: "2026-08-20", totalAmount: 60.5, category: "office_supplies", status: "booked" },
];
const FAKE_BANK_TX = [
  { transactionDate: "2026-08-10", amount: 121.0, direction: "credit", description: "Sample payment", status: "matched" },
];

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/ai/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockGroqOnce(answerText: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: answerText } }] }), { status: 200 })
    )
  );
}

beforeEach(() => {
  invoiceFindMany.mockReset().mockResolvedValue(FAKE_INVOICES);
  purchaseFindMany.mockReset().mockResolvedValue(FAKE_PURCHASES);
  bankFindMany.mockReset().mockResolvedValue(FAKE_BANK_TX);
  userFindUnique.mockReset();
  mockGetSession.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ai.assistant.use permission enforcement", () => {
  it("is granted to client and both staff roles", () => {
    expect(roleHasPermission("client", "ai.assistant.use")).toBe(true);
    expect(roleHasPermission("bookkeeper", "ai.assistant.use")).toBe(true);
    expect(roleHasPermission("admin", "ai.assistant.use")).toBe(true);
  });

  it("is a distinct permission from the staff-only ai.use (the reason it exists)", () => {
    expect(roleHasPermission("client", "ai.use")).toBe(false);
    expect(roleHasPermission("client", "ai.assistant.use")).toBe(true);
  });
});

describe("1. Valid client request", () => {
  it("returns 200 with an answer, scoped to the client's own id", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    mockGroqOnce("You have one overdue invoice, INV-0001, for €121.00.");

    const res = await POST(makeRequest({ question: "What invoices are overdue?" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ answer: "You have one overdue invoice, INV-0001, for €121.00.", scopedTo: null });
    expect(invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client-1" } }));
  });
});

describe("2. Valid staff request", () => {
  it("with no clientId, scopes to the staff member's own id", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    invoiceFindMany.mockResolvedValue([]);
    purchaseFindMany.mockResolvedValue([]);
    mockGroqOnce("No data found for this account.");

    const res = await POST(makeRequest({ question: "Anything overdue?" }));
    expect(res.status).toBe(200);
    expect(invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "staff-1" } }));
  });

  it("with an explicit clientId, scopes to that client and includes the label", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    userFindUnique.mockResolvedValue({ id: "client-9", name: "Jane Doe", company: "Sample Client BV" });
    mockGroqOnce("Sample Client BV has one overdue invoice.");

    const res = await POST(makeRequest({ question: "What invoices are overdue?", clientId: "client-9" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.scopedTo).toBe("Sample Client BV");
    expect(invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client-9" } }));
  });
});

describe("3. Question about invoices", () => {
  it("loads invoice data and includes it in the Groq prompt", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    mockGroqOnce("...");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "..." } }] })));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ question: "List my invoices" }));

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemContent = sentBody.messages[0].content as string;
    expect(systemContent).toContain("INV-0001");
  });
});

describe("4. Question about purchases", () => {
  it("loads purchase data and includes it in the Groq prompt", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "..." } }] })));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ question: "List my purchases" }));

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemContent = sentBody.messages[0].content as string;
    expect(systemContent).toContain("Sample Supplier NV");
    expect(purchaseFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "client-1" } }));
  });
});

describe("5. Bank data access", () => {
  it("is included for staff callers (bank.read is a staff permission)", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "..." } }] })));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ question: "Any recent bank transactions?" }));

    expect(bankFindMany).toHaveBeenCalled();
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages[0].content).toContain("Sample payment");
  });

  it("is NOT loaded for a client caller, matching bank.read being staff-only", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    mockGroqOnce("...");

    await POST(makeRequest({ question: "Any recent bank transactions?" }));

    expect(bankFindMany).not.toHaveBeenCalled();
  });
});

describe("6. Unauthorized request", () => {
  it("returns 401 when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ question: "What invoices are overdue?" }));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not logged in" });
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });
});

describe("7. Empty / invalid question", () => {
  it("rejects an empty question with 400", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    const res = await POST(makeRequest({ question: "" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "A question is required" });
  });

  it("rejects a missing question field with 400", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects a question over 1000 characters with 400", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    const res = await POST(makeRequest({ question: "a".repeat(1001) }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Question is too long" });
  });
});

describe("8. Attempting to access another user's data", () => {
  it("a client-supplied clientId is silently ignored — client is always locked to their own id", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    mockGroqOnce("...");

    await POST(makeRequest({ question: "What invoices are overdue?", clientId: "someone-elses-id" }));

    // Still scoped to the authenticated client, never the requested id —
    // and no lookup of the other user ever happens.
    expect(invoiceFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client-1" } }));
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("staff requesting a non-existent clientId gets 404, not a data leak", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    userFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ question: "What invoices are overdue?", clientId: "does-not-exist" }));
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Client not found" });
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });
});

describe("9. Attempting to modify accounting data via the assistant", () => {
  it("still only returns a text answer — there is no write path to reach", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    // Even if the model complies and "confirms" an action in prose, the
    // route itself never calls a mutating Prisma method — none is even
    // exposed on the mock (see the prisma mock above), so any attempt
    // would throw instead of silently working.
    mockGroqOnce("I can only answer questions — I can't mark invoices as paid. Please do that in the app.");

    const res = await POST(makeRequest({ question: "Mark invoice INV-0001 as paid" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.answer).toContain("can't mark invoices as paid");
  });

  it("the system prompt explicitly instructs the model it cannot perform actions", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "..." } }] })));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest({ question: "Mark invoice INV-0001 as paid" }));

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.messages[0].content).toMatch(/cannot create, edit, delete, send, validate, or book/i);
  });
});

describe("10. Response shape", () => {
  it("success shape: { answer: string, scopedTo: string | null }", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    mockGroqOnce("Answer text.");
    const res = await POST(makeRequest({ question: "Hi" }));
    const json = await res.json();
    expect(Object.keys(json).sort()).toEqual(["answer", "scopedTo"]);
    expect(typeof json.answer).toBe("string");
  });

  it("error shape: { error: string }", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    const res = await POST(makeRequest({ question: "" }));
    const json = await res.json();
    expect(Object.keys(json)).toEqual(["error"]);
    expect(typeof json.error).toBe("string");
  });

  it("rate-limit error shape includes retryAfterSeconds once the limit is exceeded", async () => {
    mockGetSession.mockResolvedValue(CLIENT_SESSION);
    mockGroqOnce("ok");
    // The route's rate limit for this permission is 15 requests / 60s.
    for (let i = 0; i < 15; i++) {
      await POST(makeRequest({ question: `Question ${i}` }));
    }
    const res = await POST(makeRequest({ question: "One too many" }));
    const json = await res.json();
    expect(res.status).toBe(429);
    expect(json).toEqual(
      expect.objectContaining({ error: expect.any(String), retryAfterSeconds: expect.any(Number) })
    );
  });
});

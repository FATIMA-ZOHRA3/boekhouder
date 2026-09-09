import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// Same environment constraints as tests/ai-assistant.test.ts: the generated
// Prisma client isn't available in this sandbox (prisma generate can't reach
// binaries.prisma.sh here), so @/lib/prisma is mocked, and @/lib/auth is
// mocked because getSession() needs a live Next.js request-dispatch context
// that only exists under `next dev`/`next start`. Everything downstream —
// permission enforcement, the real requireAiAccess/callGroq from @/lib/ai,
// and each route's own logic — is real, unmocked code.
//
// `fs/promises` and `sharp` are mocked for the scan-purchase-document tests
// only: this suite is about the Groq call/retry/cache/dedup behavior, not
// about image decoding, so the file read and compression are stubbed to a
// fixed fake buffer rather than exercising real image processing.
//
// Each test uses its own purchaseDocumentId/userId/description so that the
// in-flight-dedup map, the category-suggestion cache, and the per-user rate
// limiter in @/lib/ai (all module-level, process-lifetime state by design —
// see their comments) don't leak between test cases in this file.
// ─────────────────────────────────────────────────────────────────────────

process.env.GROQ_API_KEY = "test-key-not-real";

const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));

const purchaseDocumentFindUnique = vi.fn();
const invoiceFindUnique = vi.fn();
const ledgerAccountFindMany = vi.fn();
const systemSettingFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseDocument: { findUnique: (...args: unknown[]) => purchaseDocumentFindUnique(...args) },
    invoice: { findUnique: (...args: unknown[]) => invoiceFindUnique(...args) },
    ledgerAccount: { findMany: (...args: unknown[]) => ledgerAccountFindMany(...args) },
    systemSetting: { findUnique: (...args: unknown[]) => systemSettingFindUnique(...args) },
  },
}));

vi.mock("fs/promises", () => ({ readFile: vi.fn().mockResolvedValue(Buffer.from("fake-file-bytes")) }));
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    resize: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from("fake-compressed-bytes") }) }),
  })),
}));

import { POST as scanPOST } from "@/app/api/ai/scan-purchase-document/route";
import { POST as categorizePOST } from "@/app/api/ai/suggest-category/route";

const STAFF = (id: string) => ({ id: `sess-${id}`, userId: id, createdAt: new Date(), lastActivity: new Date(), role: "bookkeeper" as const });

function scanRequest(body: unknown) {
  return new Request("http://localhost/api/ai/scan-purchase-document", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
function categorizeRequest(body: unknown) {
  return new Request("http://localhost/api/ai/suggest-category", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function baseDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "doc-1", userId: "client-1", fileName: "receipt.jpg", fileUrl: "/uploads/receipt.jpg",
    fileType: "jpg", fileSize: 12345, status: "uploaded", label: null,
    supplierName: null, invoiceNumber: null, amount: null, vatAmount: null, totalAmount: null,
    documentDate: null, category: null, description: null, vatType: null, notes: null, dueDate: null,
    source: "upload", reminderCount: 0, reminderCosts: null, paidAt: null, bookedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

const GROQ_SCAN_ANSWER = JSON.stringify({
  supplierName: "Acme Supplies BV", invoiceNumber: "INV-42", documentDate: "2026-08-01",
  amount: 100, vatAmount: 21, totalAmount: 121, vatType: "high", description: "Office supplies", confidence: "high",
});
const GROQ_CATEGORY_ANSWER = JSON.stringify({ accountNumber: "4400", accountName: "Office supplies", reasoning: "Matches office supplies." });

const LEDGER_ACCOUNTS = [
  { id: "la-1", accountNumber: "4400", name: "Office supplies", defaultVatCode: { code: "H", name: "High", percentage: 21 } },
];

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

beforeEach(() => {
  purchaseDocumentFindUnique.mockReset();
  invoiceFindUnique.mockReset();
  ledgerAccountFindMany.mockReset().mockResolvedValue(LEDGER_ACCOUNTS);
  systemSettingFindUnique.mockReset().mockResolvedValue(null);
  mockGetSession.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ───────────────────────── SCANNER ─────────────────────────

describe("scan-purchase-document — normal scan", () => {
  it("calls Groq once and returns fromCache: false for a document with no existing data", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-normal"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-normal" }));
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: GROQ_SCAN_ANSWER } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-normal" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.supplierName).toBe("Acme Supplies BV");
    expect(json.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // service_tier: "auto" is applied to every Groq call by callGroq().
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.service_tier).toBe("auto");
  });
});

describe("scan-purchase-document — duplicate scan is served from cache", () => {
  it("does NOT call Groq when the document already has scanned/filled data", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-cache"));
    purchaseDocumentFindUnique.mockResolvedValue(
      baseDoc({ id: "doc-cached", supplierName: "Already Scanned BV", amount: 50, totalAmount: 60.5 })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-cached" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fromCache).toBe(true);
    expect(json.supplierName).toBe("Already Scanned BV");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DOES call Groq again when force: true is explicitly passed", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-force"));
    purchaseDocumentFindUnique.mockResolvedValue(
      baseDoc({ id: "doc-force", supplierName: "Already Scanned BV", amount: 50, totalAmount: 60.5 })
    );
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: GROQ_SCAN_ANSWER } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-force", force: true }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("scan-purchase-document — concurrent duplicate calls (double-click / double-submit)", () => {
  it("de-duplicates two concurrent requests for the SAME document into a single Groq call", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-concurrent"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-concurrent" }));
    let resolveFetch!: (v: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );
    vi.stubGlobal("fetch", fetchMock);

    const p1 = scanPOST(scanRequest({ purchaseDocumentId: "doc-concurrent" }));
    const p2 = scanPOST(scanRequest({ purchaseDocumentId: "doc-concurrent" }));
    // Let both requests reach the Groq call before resolving it.
    await new Promise((r) => setTimeout(r, 10));
    resolveFetch(jsonResponse({ choices: [{ message: { content: GROQ_SCAN_ANSWER } }] }));

    const [res1, res2] = await Promise.all([p1, p2]);
    const [json1, json2] = await Promise.all([res1.json(), res2.json()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json1.supplierName).toBe("Acme Supplies BV");
    expect(json2.supplierName).toBe("Acme Supplies BV");
  });
});

describe("scan-purchase-document — 429 handling", () => {
  it("retries automatically once when Groq's retry-after is short, then succeeds", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-429-short"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-429-short" }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429, headers: { "retry-after": "1" },
      }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: GROQ_SCAN_ANSWER } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-429-short" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.supplierName).toBe("Acme Supplies BV");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry and returns AI_RATE_LIMIT immediately when Groq's retry-after is long", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-429-long"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-429-long" }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429, headers: { "retry-after": "30" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-429-long" }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.code).toBe("AI_RATE_LIMIT");
    expect(json.retryAfterSeconds).toBe(30);
    // Exactly one call: a long wait is surfaced to the caller instead of blindly
    // retrying against an already-exhausted quota.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads Groq's x-ratelimit-reset-requests header when retry-after is absent", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-429-headers"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-429-headers" }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429, headers: { "x-ratelimit-reset-requests": "45.2s" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-429-headers" }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.code).toBe("AI_RATE_LIMIT");
    expect(json.retryAfterSeconds).toBe(46); // ceil(45.2)
  });
});

describe("scan-purchase-document — timeout", () => {
  it("returns AI_TIMEOUT and does not hang", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-timeout"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-timeout" }));
    // Simulate an already-expired timeout instead of waiting out the real
    // 40s AbortSignal.timeout() the scan route configures — the fetch mock
    // checks the signal synchronously and rejects immediately, exactly what
    // a real timeout looks like to callGroq's catch block.
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
    const fetchMock = vi.fn().mockImplementation((_url: string, opts: { signal: AbortSignal }) => {
      if (opts.signal?.aborted) {
        const err = new Error("The operation was aborted");
        err.name = "TimeoutError";
        return Promise.reject(err);
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-timeout" }));
    const json = await res.json();

    expect(res.status).toBe(504);
    expect(json.code).toBe("AI_TIMEOUT");
    // A timeout is never auto-retried (retrying an already-slow/stuck provider
    // immediately doesn't help) — exactly one attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    timeoutSpy.mockRestore();
  });
});

describe("scan-purchase-document — invalid AI JSON", () => {
  it("returns AI_INVALID_RESPONSE when Groq's content isn't valid JSON", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-scan-badjson"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-badjson" }));
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "not json at all {{{" } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-badjson" }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.code).toBe("AI_INVALID_RESPONSE");
  });
});

describe("scan-purchase-document — missing API key", () => {
  it("returns AI_NOT_CONFIGURED without calling Groq", async () => {
    const previous = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    mockGetSession.mockResolvedValue(STAFF("u-scan-nokey"));
    purchaseDocumentFindUnique.mockResolvedValue(baseDoc({ id: "doc-nokey" }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const res = await scanPOST(scanRequest({ purchaseDocumentId: "doc-nokey" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.code).toBe("AI_NOT_CONFIGURED");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env.GROQ_API_KEY = previous;
    }
  });
});

// ───────────────────────── CATEGORIZATION ─────────────────────────

describe("suggest-category — normal categorize", () => {
  it("calls Groq once and validates the account against the real ledger list", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-cat-normal"));
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: GROQ_CATEGORY_ANSWER } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await categorizePOST(categorizeRequest({ description: "Printer paper purchase — normal test" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.accountNumber).toBe("4400");
    expect(json.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("suggest-category — duplicate categorize is served from cache", () => {
  it("does not call Groq again for the same description without force", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-cat-cache"));
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: GROQ_CATEGORY_ANSWER } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await categorizePOST(categorizeRequest({ description: "Repeated office supplies entry" }));
    expect((await first.json()).fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await categorizePOST(categorizeRequest({ description: "Repeated office supplies entry" }));
    const secondJson = await second.json();
    expect(secondJson.fromCache).toBe(true);
    expect(secondJson.accountNumber).toBe("4400");
    // Still exactly 1 — the second call was served from cache.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calls Groq again when force: true is explicitly passed", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-cat-force"));
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({ choices: [{ message: { content: GROQ_CATEGORY_ANSWER } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    await categorizePOST(categorizeRequest({ description: "Force-regenerate entry" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await categorizePOST(categorizeRequest({ description: "Force-regenerate entry", force: true }));
    expect((await second.json()).fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("calls Groq again when the description text changed (different cache key)", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-cat-changed"));
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse({ choices: [{ message: { content: GROQ_CATEGORY_ANSWER } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    await categorizePOST(categorizeRequest({ description: "Original entry text A" }));
    await categorizePOST(categorizeRequest({ description: "Different entry text B" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("suggest-category — concurrent duplicate calls", () => {
  it("de-duplicates two concurrent requests for the SAME description into a single Groq call", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-cat-concurrent"));
    let resolveFetch!: (v: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );
    vi.stubGlobal("fetch", fetchMock);

    const p1 = categorizePOST(categorizeRequest({ description: "Concurrent categorize entry" }));
    const p2 = categorizePOST(categorizeRequest({ description: "Concurrent categorize entry" }));
    await new Promise((r) => setTimeout(r, 10));
    resolveFetch(jsonResponse({ choices: [{ message: { content: GROQ_CATEGORY_ANSWER } }] }));

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await res1.json()).accountNumber).toBe("4400");
    expect((await res2.json()).accountNumber).toBe("4400");
  });
});

describe("suggest-category — invalid account guardrail", () => {
  it("rejects a Groq suggestion that doesn't match a real ledger account", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-cat-badaccount"));
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({ accountNumber: "9999", accountName: "Made up", reasoning: "..." }) } }],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await categorizePOST(categorizeRequest({ description: "Entry with a hallucinated account" }));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.code).toBe("AI_INVALID_RESPONSE");
  });
});

describe("callGroq — service_tier fallback for orgs without flex access", () => {
  it("drops service_tier and retries automatically when Groq rejects it, without burning the retry budget", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-service-tier-fallback"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "`service_tier` `auto` is not available for this org. You can check your plan at https://console.groq.com/settings/billing/plans, and upgrade to access the required service tier.", type: "invalid_request_error" } }),
          { status: 400 }
        )
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: GROQ_CATEGORY_ANSWER } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await categorizePOST(categorizeRequest({ description: "Service tier fallback test entry" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.accountNumber).toBe("4400");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call must NOT include service_tier anymore.
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.service_tier).toBeUndefined();
  });

  it("stops sending service_tier on subsequent calls once learned unsupported", async () => {
    mockGetSession.mockResolvedValue(STAFF("u-service-tier-remembered"));
    // Third call in this suite for this same process — service_tier should already
    // be known unsupported from the previous test, so this should succeed in ONE call.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: GROQ_CATEGORY_ANSWER } }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await categorizePOST(categorizeRequest({ description: "Service tier remembered test entry" }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.service_tier).toBeUndefined();
  });
});

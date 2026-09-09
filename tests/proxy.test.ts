import { describe, it, expect, vi, beforeEach } from "vitest";

// The real src/lib/prisma.ts imports the generated Prisma client (src/generated/prisma),
// which only exists after `prisma generate` has run against a reachable database. Mocking
// the module here lets this test exercise proxy.ts's actual authorization logic in
// isolation, the same way the rest of this test suite avoids requiring a live database.
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { session: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

import { proxy } from "../proxy";

function makeRequest(pathname: string, cookie?: string) {
  const url = `http://localhost:3000${pathname}`;
  return {
    nextUrl: { pathname },
    url,
    cookies: {
      get: (name: string) =>
        name === "boekhouder_session" && cookie ? { value: cookie } : undefined,
    },
  } as unknown as Parameters<typeof proxy>[0];
}

beforeEach(() => {
  findUnique.mockReset();
});

describe("proxy() — Pilier 2 page-level protection", () => {
  it("passes through untouched paths without querying the session at all", async () => {
    const response = await proxy(makeRequest("/login"));
    expect(findUnique).not.toHaveBeenCalled();
    expect(response.status).not.toBe(307); // NextResponse.next() is not a redirect
  });

  it("redirects to /login when there is no session cookie on a protected path", async () => {
    const response = await proxy(makeRequest("/bookkeeper"));
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects to /login when the session does not exist or is expired", async () => {
    findUnique.mockResolvedValue(null);
    const response = await proxy(makeRequest("/admin", "sess-expired"));
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects a client to /403 when visiting /bookkeeper", async () => {
    findUnique.mockResolvedValue({
      id: "sess-1",
      lastActivity: new Date(),
      user: { role: "client" },
    });
    const response = await proxy(makeRequest("/bookkeeper", "sess-1"));
    expect(response.headers.get("location")).toContain("/403");
  });

  it("redirects a bookkeeper to /403 when visiting /admin", async () => {
    findUnique.mockResolvedValue({
      id: "sess-2",
      lastActivity: new Date(),
      user: { role: "bookkeeper" },
    });
    const response = await proxy(makeRequest("/admin", "sess-2"));
    expect(response.headers.get("location")).toContain("/403");
  });

  it("lets a bookkeeper through to /bookkeeper", async () => {
    findUnique.mockResolvedValue({
      id: "sess-3",
      lastActivity: new Date(),
      user: { role: "bookkeeper" },
    });
    const response = await proxy(makeRequest("/bookkeeper", "sess-3"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets an admin through to every protected prefix", async () => {
    findUnique.mockResolvedValue({
      id: "sess-4",
      lastActivity: new Date(),
      user: { role: "admin" },
    });
    for (const path of ["/admin", "/bookkeeper", "/client"]) {
      const response = await proxy(makeRequest(path, "sess-4"));
      expect(response.headers.get("location")).toBeNull();
    }
  });
});

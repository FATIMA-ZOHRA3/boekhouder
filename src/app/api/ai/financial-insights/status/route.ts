import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["new", "reviewed", "dismissed"] as const;

// POST /api/ai/financial-insights/status
// Body: { clientId, insightId, status }
//
// STEP 8/10 — this only ever changes a triage label the accountant applied
// to an insight card ("I've seen this" / "not relevant"). It never writes
// to an invoice, ledger entry, or any other financial record — that
// principle ("AI proposes -> accountant reviews -> accountant decides") is
// enforced by construction: this route's Prisma call only ever touches
// SystemSetting.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "ai.use");
  if (!check.ok) return NextResponse.json({ error: "No access" }, { status: check.status });

  const body = await request.json().catch(() => null);
  const clientId = body?.clientId;
  const insightId = body?.insightId;
  const status = body?.status;

  if (typeof clientId !== "string" || !clientId) {
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });
  }
  if (typeof insightId !== "string" || !insightId) {
    return NextResponse.json({ error: "insightId is required" }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "status must be one of new, reviewed, dismissed" }, { status: 400 });
  }

  const key = `ai_insight_status:${clientId}:${insightId}`;

  if (status === "new") {
    // "new" is the implicit default (no row) — delete rather than store, to
    // avoid an ever-growing table of no-op rows.
    await prisma.systemSetting.deleteMany({ where: { key } });
  } else {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: status },
      create: { key, value: status },
    });
  }

  return NextResponse.json({ ok: true, clientId, insightId, status });
}

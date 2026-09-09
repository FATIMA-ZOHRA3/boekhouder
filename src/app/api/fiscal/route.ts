import { NextRequest, NextResponse } from "next/server";
import { getFiscalSummary, getTaxEstimate } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Identity-aware: customer-portal users always see their OWN fiscal
// summary; bookkeeper/admin can request a specific clientId. Previously
// this route accepted any clientId with no authentication at all.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const requestedClientId = request.nextUrl.searchParams.get("clientId");
  const effectiveClientId = isStaff && requestedClientId ? requestedClientId : me.id;
  const [summary, taxEstimate] = await Promise.all([
    getFiscalSummary(effectiveClientId),
    getTaxEstimate(effectiveClientId),
  ]);
  return NextResponse.json({ ...summary, taxEstimate });
}

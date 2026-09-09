import { NextResponse } from "next/server";
import { getClients } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Identity-aware: the full client list is accountant-only. Customer-portal
// users previously received every client's name/email/company through this
// endpoint, which is a privacy leak. They now receive only their own record
// (matching what /api/profile returns, so existing UI keeps working).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  if (me.role === "bookkeeper" || me.role === "admin") {
    return NextResponse.json(await getClients());
  }
  // Client role: return only self so the customer portal can still resolve
  // the logged-in user's company label without exposing anyone else.
  const selfRecord = await prisma.user.findUnique({ where: { id: me.id } });
  return NextResponse.json(selfRecord ? [selfRecord] : []);
}

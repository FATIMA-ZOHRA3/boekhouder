import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

// Was previously unauthenticated (GET/PATCH/DELETE all open to anyone who
// knew or guessed a quotation id). Ownership-scoped the same way
// src/app/api/invoices/route.ts already does. See report for details.
async function loadCallerAndTarget(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) } as const;
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) } as const;
  const isStaff = me.role === "bookkeeper" || me.role === "admin";
  const q = await prisma.quotation.findUnique({ where: { id } });
  // 404 (not 403) when a non-owner probes an id, so existence isn't leaked.
  if (!q || (!isStaff && q.clientId !== me.id)) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  }
  return { me, isStaff, quotation: q } as const;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadCallerAndTarget(id);
  if ("error" in result) return result.error;
  const q = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  return NextResponse.json(q);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadCallerAndTarget(id);
  if ("error" in result) return result.error;
  // No client-side UI currently edits a quotation via PATCH (the client
  // "edit" flow does DELETE + POST instead — see report), and letting a
  // client set their own `status` here would bypass the token-based accept
  // flow. Kept staff-only until that's a deliberate product decision.
  if (!result.isStaff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const body = await request.json();
  const q = await prisma.quotation.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
    include: { items: true },
  });

  await logAudit({
    userId: result.me.id,
    userRole: result.me.role,
    action: "quotation.update",
    entity: "Quotation",
    entityId: id,
    before: { status: result.quotation.status, notes: result.quotation.notes },
    after: { status: q.status, notes: q.notes },
  });

  return NextResponse.json(q);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadCallerAndTarget(id);
  if ("error" in result) return result.error;
  try {
    await prisma.quotation.delete({ where: { id } });
    await logAudit({
      userId: result.me.id,
      userRole: result.me.role,
      action: "quotation.delete",
      entity: "Quotation",
      entityId: id,
      before: { quotationNumber: result.quotation.quotationNumber, status: result.quotation.status, clientId: result.quotation.clientId },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

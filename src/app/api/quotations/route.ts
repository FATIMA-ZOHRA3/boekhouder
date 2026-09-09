import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

// Same identity-aware scoping as src/app/api/invoices/route.ts (Pilier 2):
// this resource previously had NO auth check at all (any caller could list
// or create quotations for any clientId). Mirrored here rather than
// reinvented — see that file for the original pattern and rationale.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const requestedClientId = request.nextUrl.searchParams.get("clientId");
  // Customer portal: always scoped to self, regardless of what the client
  // sends (the frontend currently sends a stale hardcoded value here — see
  // report — this also neutralizes that).
  const effectiveClientId = isStaff ? requestedClientId : me.id;
  const where = effectiveClientId ? { clientId: effectiveClientId } : {};

  const quotations = await prisma.quotation.findMany({
    where,
    include: { items: true, _count: { select: { quotationNotes: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(quotations);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const body = await request.json();
  // Force clientId to the session owner unless staff, same rule as invoices.
  if (!isStaff) body.clientId = me.id;

  const items = body.items || [];
  const subtotal = items.reduce((s: number, i: { quantity: number; unitPrice: number }) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = items.reduce((s: number, i: { quantity: number; unitPrice: number; vatRate: number }) => s + i.quantity * i.unitPrice * (i.vatRate / 100), 0);

  const quotation = await prisma.quotation.create({
    data: {
      clientId: body.clientId,
      customerId: body.customerId || null,
      quotationNumber: body.quotationNumber,
      date: body.date,
      validUntil: body.validUntil,
      customerName: body.customerName,
      customerAddress: body.customerAddress || "",
      subtotal,
      vatAmount,
      total: subtotal + vatAmount,
      status: body.status || "draft",
      notes: body.notes || null,
      items: { create: items },
    },
    include: { items: true },
  });

  await logAudit({
    userId: me.id,
    userRole: me.role,
    action: "quotation.create",
    entity: "Quotation",
    entityId: quotation.id,
    after: { quotationNumber: quotation.quotationNumber, status: quotation.status, total: quotation.total, clientId: quotation.clientId },
  });

  return NextResponse.json(quotation, { status: 201 });
}

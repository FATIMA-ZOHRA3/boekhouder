import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Was previously unauthenticated. Ownership-gated like the sibling routes.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const original = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!original || (!isStaff && original.clientId !== me.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const year = new Date().getFullYear().toString();
  const prefix = `OFF-${year}`;
  const latest = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });
  let seq = 1;
  if (latest) { const p = parseInt(latest.quotationNumber.slice(prefix.length), 10); if (!isNaN(p)) seq = p + 1; }
  const quotationNumber = `${prefix}${seq.toString().padStart(5, "0")}`;
  const today = new Date().toISOString().split("T")[0];
  const validUntil = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })();

  const copy = await prisma.quotation.create({
    data: {
      clientId: original.clientId,
      customerId: original.customerId,
      quotationNumber,
      date: today,
      validUntil,
      customerName: original.customerName,
      customerAddress: original.customerAddress,
      subtotal: original.subtotal,
      vatAmount: original.vatAmount,
      total: original.total,
      status: "draft",
      notes: original.notes,
      items: { create: original.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, vatRate: i.vatRate })) },
    },
    include: { items: true },
  });

  return NextResponse.json(copy, { status: 201 });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function generateNextInvoiceNumber(clientId: string): Promise<string> {
  const year = new Date().getFullYear().toString();
  const latest = await prisma.invoice.findFirst({
    where: { clientId, invoiceNumber: { startsWith: year } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  let nextSeq = 1;
  if (latest) {
    const parsed = parseInt(latest.invoiceNumber.slice(year.length), 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }
  return `${year}${nextSeq.toString().padStart(5, "0")}`;
}

// Was previously unauthenticated. Ownership-gated — both the client "credit
// this invoice" button and the bookkeeper one call this same route.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const original = await prisma.invoice.findUnique({
    where: { id },
    include: { items: true, creditInvoices: true },
  });
  if (!original || (!isStaff && original.clientId !== me.id)) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const totalCredited = original.creditInvoices.reduce((sum, ci) => sum + Math.abs(ci.total), 0);
  if (totalCredited >= Math.abs(original.total)) {
    return NextResponse.json({ error: "This invoice has already been fully credited" }, { status: 400 });
  }

  const invoiceNumber = await generateNextInvoiceNumber(original.clientId);
  const today = new Date().toISOString().split("T")[0];

  const creditInvoice = await prisma.invoice.create({
    data: {
      clientId: original.clientId,
      customerId: original.customerId,
      invoiceNumber,
      date: today,
      dueDate: today,
      customerName: original.customerName,
      customerAddress: original.customerAddress,
      subtotal: -original.subtotal,
      vatAmount: -original.vatAmount,
      total: -original.total,
      status: "draft",
      bookkeepingStatus: "pending",
      notes: `Credit invoice for ${original.invoiceNumber}`,
      isCredit: true,
      originalInvoiceId: original.id,
      items: {
        create: original.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatRate: item.vatRate,
        })),
      },
    },
    include: { items: true },
  });

  return NextResponse.json(creditInvoice, { status: 201 });
}

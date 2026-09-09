import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireOwnedInvoice(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) } as const;
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) } as const;
  const isStaff = me.role === "bookkeeper" || me.role === "admin";
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice || (!isStaff && invoice.clientId !== me.id)) return { error: NextResponse.json({ error: "Invoice not found" }, { status: 404 }) } as const;
  return { invoice } as const;
}

// Was previously unauthenticated — anyone could record a fake payment
// against any invoice, marking it paid. Ownership-gated like the siblings.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireOwnedInvoice(id);
  if ("error" in result) return result.error;
  const payments = await prisma.payment.findMany({
    where: { invoiceId: id },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(payments);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await requireOwnedInvoice(id);
  if ("error" in result) return result.error;
  const { invoice } = result;

  const body = await request.json();
  const { amount, date, notes } = body;
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }

  const remaining = Math.abs(invoice.total) - invoice.paidAmount;
  if (amount > remaining + 0.01) {
    return NextResponse.json({ error: `Amount may not be higher than the outstanding amount (${remaining.toFixed(2)})` }, { status: 400 });
  }

  const payment = await prisma.payment.create({
    data: {
      invoiceId: id,
      amount,
      date: date || new Date().toISOString().split("T")[0],
      notes: notes || null,
    },
  });

  const newPaidAmount = invoice.paidAmount + amount;
  const invoiceTotal = Math.abs(invoice.total);
  let newStatus = invoice.status;
  if (newPaidAmount >= invoiceTotal - 0.01) newStatus = "paid";
  else if (newPaidAmount > 0) newStatus = "partial";

  await prisma.invoice.update({
    where: { id },
    data: { paidAmount: newPaidAmount, status: newStatus },
  });

  return NextResponse.json({ payment, newStatus, paidAmount: newPaidAmount });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addInvoice } from "@/lib/data";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

// Was previously unauthenticated. Converting a quotation books a real
// invoice, so this needs the same ownership gate as the other quotation
// sub-routes (see src/app/api/quotations/[id]/route.ts).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const q = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!q || (!isStaff && q.clientId !== me.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (q.status !== "accepted") return NextResponse.json({ error: "Only accepted quotations can be converted" }, { status: 400 });

  // Generate next invoice number
  const year = new Date().getFullYear().toString();
  const latest = await prisma.invoice.findFirst({
    where: { clientId: q.clientId, invoiceNumber: { startsWith: year } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  let seq = 1;
  if (latest) { const p = parseInt(latest.invoiceNumber.slice(year.length), 10); if (!isNaN(p)) seq = p + 1; }
  const invoiceNumber = `${year}${seq.toString().padStart(5, "0")}`;
  const today = new Date().toISOString().split("T")[0];

  // Get customer payment terms for due date
  let dueDate = (() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split("T")[0]; })();
  if (q.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: q.customerId } });
    if (customer?.paymentTermValue && customer?.paymentTermUnit) {
      const d = new Date();
      if (customer.paymentTermUnit === "days") d.setDate(d.getDate() + customer.paymentTermValue);
      else if (customer.paymentTermUnit === "weeks") d.setDate(d.getDate() + customer.paymentTermValue * 7);
      else d.setMonth(d.getMonth() + customer.paymentTermValue);
      dueDate = d.toISOString().split("T")[0];
    }
  }

  const invoice = await addInvoice({
    clientId: q.clientId,
    customerId: q.customerId,
    invoiceNumber,
    date: today,
    dueDate,
    customerName: q.customerName,
    customerAddress: q.customerAddress,
    items: q.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, vatRate: i.vatRate })),
    subtotal: q.subtotal,
    vatAmount: q.vatAmount,
    total: q.total,
    status: "draft",
    notes: `Gebaseerd op offerte ${q.quotationNumber}`,
  });

  await prisma.quotation.update({
    where: { id },
    data: { status: "converted", convertedInvoiceId: invoice.id },
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { sourceQuotationId: q.id },
  });

  await logAudit({
    userId: me.id,
    userRole: me.role,
    action: "quotation.convert",
    entity: "Quotation",
    entityId: id,
    before: { status: "accepted" },
    after: { status: "converted" },
    metadata: { convertedInvoiceId: invoice.id },
  });
  // Bypasses POST /api/invoices (calls addInvoice directly), so it isn't
  // covered by that route's invoice.create logging — logged here instead.
  await logAudit({
    userId: me.id,
    userRole: me.role,
    action: "invoice.create",
    entity: "Invoice",
    entityId: invoice.id,
    after: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, total: invoice.total, clientId: invoice.clientId },
    metadata: { sourceQuotationId: q.id },
  });

  return NextResponse.json(invoice, { status: 201 });
}

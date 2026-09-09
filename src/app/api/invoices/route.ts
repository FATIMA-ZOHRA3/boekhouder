import { NextRequest, NextResponse } from "next/server";
import { getAllInvoices, getInvoicesByClient, addInvoice } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

export async function GET(request: NextRequest) {
  // Identity-aware scoping. Customer-portal users may only read their own
  // invoices; bookkeeper/admin accounts can query by clientId or get all.
  // Any stale client-side code that passes someone else's clientId is
  // forced back to the session owner — fail safe, not fail open.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const requestedClientId = request.nextUrl.searchParams.get("clientId");
  const customerId = request.nextUrl.searchParams.get("customerId");
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  if (customerId) {
    // For a customer-scoped lookup, require that the customer belongs to
    // the caller (unless staff). Without this check, any authenticated
    // user could enumerate any customer's invoices.
    if (!isStaff) {
      const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { userId: true } });
      if (!customer || customer.userId !== me.id) {
        return NextResponse.json({ error: "Not allowed" }, { status: 403 });
      }
    }
    const invoices = await prisma.invoice.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(invoices);
  }

  // Customer portal: always scope to self regardless of query param.
  // Bookkeeper/admin: honor the explicit clientId param, or fall back to all.
  const effectiveClientId = isStaff ? requestedClientId : me.id;
  const invoices = effectiveClientId ? await getInvoicesByClient(effectiveClientId) : await getAllInvoices();
  return NextResponse.json(invoices);
}

async function generateUniqueInvoiceNumber(clientId: string): Promise<string> {
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

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const body = await request.json();
  // Force clientId to the session owner unless the caller is staff.
  // Prevents a customer from creating an invoice on behalf of another user.
  if (!isStaff) body.clientId = me.id;
  const items = body.items || [];
  const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0);
  const vatAmount = items.reduce(
    (sum: number, item: { quantity: number; unitPrice: number; vatRate: number }) => sum + item.quantity * item.unitPrice * (item.vatRate / 100),
    0
  );

  // Check if the submitted invoice number already exists, if so generate a new one
  let invoiceNumber = body.invoiceNumber;
  if (invoiceNumber) {
    const exists = await prisma.invoice.findFirst({
      where: { clientId: body.clientId, invoiceNumber },
    });
    if (exists) {
      invoiceNumber = await generateUniqueInvoiceNumber(body.clientId);
    }
  } else {
    invoiceNumber = await generateUniqueInvoiceNumber(body.clientId);
  }

  const invoice = await addInvoice({
    clientId: body.clientId,
    customerId: body.customerId || null,
    invoiceNumber,
    date: body.date,
    dueDate: body.dueDate,
    customerName: body.customerName,
    customerAddress: body.customerAddress,
    items,
    subtotal,
    vatAmount,
    total: subtotal + vatAmount,
    status: body.status || "draft",
    notes: body.notes,
    isCredit: body.isCredit || false,
    originalInvoiceId: body.originalInvoiceId || null,
  });

  await logAudit({
    userId: me.id,
    userRole: me.role,
    action: "invoice.create",
    entity: "Invoice",
    entityId: invoice.id,
    after: { invoiceNumber: invoice.invoiceNumber, status: invoice.status, total: invoice.total, clientId: invoice.clientId },
  });

  return NextResponse.json(invoice, { status: 201 });
}

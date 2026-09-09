import { NextRequest, NextResponse } from "next/server";
import { getInvoice, updateInvoiceBookkeepingStatus, updateInvoiceStatus } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { notificationTemplates } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

// Was previously unauthenticated on all three verbs (GET/PATCH/DELETE) —
// see report. Ownership-scoped the same way src/app/api/invoices/route.ts
// already does for the collection endpoint.
async function loadCallerAndInvoice(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) } as const;
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) } as const;
  const isStaff = me.role === "bookkeeper" || me.role === "admin";
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice || (!isStaff && invoice.clientId !== me.id)) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  }
  // `invoice` here is the pre-change snapshot — callers reuse it as the
  // audit log's `before`, instead of re-querying it a second time.
  return { me, isStaff, session, invoice } as const;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await loadCallerAndInvoice(id);
  if ("error" in result) return result.error;
  const invoice = await getInvoice(id);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(invoice);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await loadCallerAndInvoice(id);
  if ("error" in result) return result.error;
  // Bookkeeping status, line bookings and direct field edits here are all
  // staff actions in the current UI (the client "edit" flow uses
  // DELETE + POST instead, like quotations) — matches invoice.update /
  // invoice.book both being staff-only in permissions.ts.
  if (!result.isStaff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const body = await request.json();
  const sessionUserId = result.me.id;
  const before = { status: result.invoice.status, bookkeepingStatus: result.invoice.bookkeepingStatus, total: result.invoice.total };
  const actionsFired: string[] = [];

  let invoice;
  if (body.bookkeepingStatus) {
    invoice = await updateInvoiceBookkeepingStatus(id, body.bookkeepingStatus, body.category, body.vatType);
    actionsFired.push("book");
    if (body.bookkeepingStatus === "booked" && invoice && sessionUserId) {
      notificationTemplates.invoiceBooked(sessionUserId, invoice.invoiceNumber, invoice.customerName, invoice.id).catch(() => {});
    }
  }
  if (body.status) {
    invoice = await updateInvoiceStatus(id, body.status);
    actionsFired.push("status_change");
  }

  if (body.lineBookings && Array.isArray(body.lineBookings)) {
    for (const lb of body.lineBookings) {
      if (lb.itemId) {
        await prisma.invoiceItem.update({
          where: { id: lb.itemId },
          data: {
            ...(lb.category !== undefined && { category: lb.category || null }),
            ...(lb.vatCode !== undefined && { vatCode: lb.vatCode || null }),
          },
        });
      }
    }
    invoice = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    actionsFired.push("line_booking");
  }

  const directUpdates: Record<string, unknown> = {};
  if (body.date !== undefined) directUpdates.date = body.date;
  if (body.dueDate !== undefined) directUpdates.dueDate = body.dueDate;
  if (body.customerName !== undefined) directUpdates.customerName = body.customerName;
  if (body.customerAddress !== undefined) directUpdates.customerAddress = body.customerAddress;
  if (body.subtotal !== undefined) directUpdates.subtotal = Number(body.subtotal);
  if (body.vatAmount !== undefined) directUpdates.vatAmount = Number(body.vatAmount);
  if (body.notes !== undefined) directUpdates.notes = body.notes;
  if (body.subtotal !== undefined || body.vatAmount !== undefined) {
    const current = await prisma.invoice.findUnique({ where: { id } });
    if (current) {
      const newSubtotal = body.subtotal !== undefined ? Number(body.subtotal) : current.subtotal;
      const newVat = body.vatAmount !== undefined ? Number(body.vatAmount) : current.vatAmount;
      directUpdates.total = newSubtotal + newVat;
    }
  }

  if (Object.keys(directUpdates).length > 0) {
    invoice = await prisma.invoice.update({
      where: { id },
      data: directUpdates,
      include: { items: true },
    });
    actionsFired.push("update");
  }

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (actionsFired.length > 0) {
    await logAudit({
      userId: result.me.id,
      userRole: result.me.role,
      action: `invoice.${actionsFired[0]}`,
      entity: "Invoice",
      entityId: id,
      before,
      after: { status: invoice.status, bookkeepingStatus: invoice.bookkeepingStatus, total: invoice.total },
      metadata: actionsFired.length > 1 ? { allActions: actionsFired } : undefined,
    });
  }

  return NextResponse.json(invoice);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await loadCallerAndInvoice(id);
  if ("error" in result) return result.error;
  try {
    await prisma.invoice.delete({ where: { id } });
    await logAudit({
      userId: result.me.id,
      userRole: result.me.role,
      action: "invoice.delete",
      entity: "Invoice",
      entityId: id,
      before: { invoiceNumber: result.invoice.invoiceNumber, status: result.invoice.status, total: result.invoice.total, clientId: result.invoice.clientId },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

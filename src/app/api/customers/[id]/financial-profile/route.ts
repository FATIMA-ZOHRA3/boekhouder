import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/customers/[id]/financial-profile
//
// Phase 7. New, small, purpose-built endpoint — same reasoning as Phase 6's
// /api/audit-logs: the existing GET /api/customers/[id] only ever scopes by
// `userId: session.userId`, i.e. it's the customer-portal-owner's own view
// of their own debtor record. It has no notion of a staff member viewing a
// debtor that belongs to whichever administration they're currently working
// in, so it can't be reused as-is for "the accountant opens a customer" —
// this route adds exactly that, following the same isStaff-bypass pattern
// already used by GET /api/invoices/[id] and friends.
//
// No new accounting logic: totals reuse the exact same status buckets
// (sent/partial/overdue = outstanding, overdue = overdue, !isCredit for all
// currency totals) as getFiscalSummary() in lib/data.ts, just scoped to one
// customer's invoices instead of a whole administration. The "auto-detect
// overdue" step below is the same 3-line pattern from that function, not a
// new rule.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return Response.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || (!isStaff && customer.userId !== me.id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Invoices for this customer: matched by customerId when the link exists,
  // falling back to the customerName snapshot for older invoices recorded
  // before an invoice was linked to a Customer record — the exact same
  // fallback the dashboard's per-debtor grouping already relies on in
  // app/bookkeeper/page.tsx (invoices are grouped by customerName there
  // because customerId isn't guaranteed to be populated on every row).
  const invoiceWhere = {
    clientId: customer.userId,
    OR: [{ customerId: customer.id }, { customerId: null, customerName: customer.name }],
  };

  const invoices = await prisma.invoice.findMany({ where: invoiceWhere, orderBy: { date: "desc" } });

  // Auto-detect overdue — identical to the loop in getFiscalSummary()
  // (lib/data.ts), just scoped to this customer's invoices instead of the
  // whole administration's.
  const today = new Date().toISOString().split("T")[0];
  for (const inv of invoices) {
    if (inv.status === "sent" && inv.dueDate < today) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "overdue" } });
      inv.status = "overdue";
    }
  }

  const nonCredit = invoices.filter((i) => !i.isCredit);
  const outstandingInvoices = nonCredit.filter((i) => i.status === "sent" || i.status === "partial" || i.status === "overdue");
  const overdueInvoices = nonCredit.filter((i) => i.status === "overdue");

  const summary = {
    totalInvoiced: nonCredit.reduce((sum, i) => sum + i.total, 0),
    totalPaid: nonCredit.reduce((sum, i) => sum + i.paidAmount, 0),
    outstanding: outstandingInvoices.reduce((sum, i) => sum + (i.total - i.paidAmount), 0),
    overdue: overdueInvoices.reduce((sum, i) => sum + (i.total - i.paidAmount), 0),
    invoiceCount: nonCredit.length,
  };

  const INVOICE_LIST_LIMIT = 50;
  const payments = await prisma.payment.findMany({
    where: { invoice: invoiceWhere },
    orderBy: { date: "desc" },
    take: 10,
    include: { invoice: { select: { invoiceNumber: true } } },
  });

  return Response.json({
    customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, userId: customer.userId },
    summary,
    invoices: invoices.slice(0, INVOICE_LIST_LIMIT).map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      date: i.date,
      total: i.total,
      status: i.status,
      isCredit: i.isCredit,
    })),
    invoiceTotalCount: invoices.length,
    payments: payments.map((p) => ({
      id: p.id,
      date: p.date,
      amount: p.amount,
      invoiceNumber: p.invoice.invoiceNumber,
    })),
    // For the reusable Phase 6 ActivityTimeline: every AuditLog entityId
    // relevant to this customer (the Customer record itself + each of its
    // invoices) so the page can show a filtered slice of the same feed
    // instead of a separate audit mechanism.
    auditEntityIds: [customer.id, ...nonCredit.map((i) => i.id)],
  });
}

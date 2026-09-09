import { prisma } from "@/lib/prisma";
import { addInvoice } from "@/lib/data";
import { requireCronSecret } from "@/lib/cronAuth";

// Cron job, not a user-facing route (nothing in src/app/ calls this — see
// report). Was previously unauthenticated, same gap as reminders/process
// had; fixed the same way for consistency. Call it with header
// `x-cron-secret: <CRON_SECRET>`.

function calculateNextDate(currentDate: string, interval: string, intervalDays?: number | null): string {
  const date = new Date(currentDate);
  switch (interval) {
    case "weekly": date.setDate(date.getDate() + 7); break;
    case "monthly": date.setMonth(date.getMonth() + 1); break;
    case "quarterly": date.setMonth(date.getMonth() + 3); break;
    case "yearly": date.setFullYear(date.getFullYear() + 1); break;
    default: date.setDate(date.getDate() + (intervalDays || 30)); break;
  }
  return date.toISOString().split("T")[0];
}

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

export async function POST(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const today = new Date().toISOString().split("T")[0];

  const dueRecurring = await prisma.recurringInvoice.findMany({
    where: { active: true, nextDate: { lte: today } },
    include: { customer: true },
  });

  const results = [];

  for (const rec of dueRecurring) {
    const template = JSON.parse(rec.templateData);
    const invoiceNumber = await generateNextInvoiceNumber(rec.clientId);
    const items = template.items || [{ description: "Dienstverlening", quantity: 1, unitPrice: 0, vatRate: 21 }];
    const subtotal = items.reduce((s: number, i: { quantity: number; unitPrice: number }) => s + i.quantity * i.unitPrice, 0);
    const vatAmount = items.reduce((s: number, i: { quantity: number; unitPrice: number; vatRate: number }) => s + i.quantity * i.unitPrice * (i.vatRate / 100), 0);

    const invoice = await addInvoice({
      clientId: rec.clientId,
      customerId: rec.customerId,
      invoiceNumber,
      date: today,
      dueDate: calculateNextDate(today, "monthly"),
      customerName: rec.customer.name,
      customerAddress: rec.customer.address || "",
      items,
      subtotal,
      vatAmount,
      total: subtotal + vatAmount,
      status: rec.autoSend ? "sent" : "draft",
      notes: template.notes || null,
    });

    // Update next date
    await prisma.recurringInvoice.update({
      where: { id: rec.id },
      data: { nextDate: calculateNextDate(rec.nextDate, rec.interval, rec.intervalDays) },
    });

    results.push({ id: invoice.id, invoiceNumber, customer: rec.customer.name });
  }

  return Response.json({ processed: results.length, invoices: results });
}

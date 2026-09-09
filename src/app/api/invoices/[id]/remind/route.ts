import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { notificationTemplates } from "@/lib/notifications";
import { getSession } from "@/lib/auth";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}
function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

// Was previously reachable with no auth gate (the session lookup only fed
// notification attribution, it never blocked the request). Ownership-gated
// like the other manual send/remind routes.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const body = await request.json();
  const { to, subject, message } = body;
  if (!to) return NextResponse.json({ error: "Email address is required" }, { status: 400 });

  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
  if (!invoice || (!isStaff && invoice.clientId !== me.id)) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const client = await prisma.user.findUnique({ where: { id: invoice.clientId } });

  const emailHtml = `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      ${client?.logoUrl ? `<img src="${process.env.APP_URL || 'http://localhost:3000'}${client.logoUrl}" alt="Logo" style="max-height:50px;margin-bottom:16px">` : ""}
      <p>${message.replace(/\n/g, "<br>")}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <div style="background:#fef3c7;padding:16px;border-radius:8px;margin-bottom:16px">
        <p style="margin:0;font-weight:bold;color:#92400e">Payment reminder</p>
        <p style="margin:4px 0 0;color:#92400e;font-size:14px">Factuur ${invoice.invoiceNumber} | Due date: ${formatDate(invoice.dueDate)}</p>
      </div>
      <div style="font-size:14px">
        <p><strong>Outstanding amount:</strong> ${formatCurrency(invoice.total)}</p>
        <p><strong>Invoice date:</strong> ${formatDate(invoice.date)}</p>
        <p><strong>Due date:</strong> ${formatDate(invoice.dueDate)}</p>
      </div>
      ${client?.iban ? `<p style="font-size:13px;color:#666;margin-top:16px">Payment: ${client.iban} in the name of ${client.accountHolder || client.company || ""}</p>` : ""}
      <p style="font-size:12px;color:#9ca3af;margin-top:24px">This is an automated reminder.</p>
    </div>
  `;

  const sent = await sendEmail({ to, subject, html: emailHtml });

  if (sent) {
    notificationTemplates.reminderSent(me.id, invoice.invoiceNumber, invoice.customerName, invoice.id).catch(() => {});
    await prisma.invoice.update({ where: { id }, data: { remindersSent: { increment: 1 } } }).catch(() => {});
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Email could not be sent" }, { status: 500 });
}

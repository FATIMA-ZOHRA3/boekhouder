import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getSession } from "@/lib/auth";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}
function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

// Was previously unauthenticated (same email-abuse concern as
// quotations/[id]/send). Ownership-gated like the siblings.
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
  const isCredit = invoice.isCredit;
  const title = isCredit ? "Credit note" : "Invoice";

  const itemRows = invoice.items.map((item) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${item.description}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(item.unitPrice)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${item.vatRate}%</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(item.quantity * item.unitPrice)}</td>
    </tr>
  `).join("");

  const emailHtml = `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      ${client?.logoUrl ? `<img src="${process.env.APP_URL || 'http://localhost:3000'}${client.logoUrl}" alt="Logo" style="max-height:50px;margin-bottom:16px">` : ""}
      <p>${message.replace(/\n/g, "<br>")}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <h3 style="color:${isCredit ? '#dc2626' : '#2E6FA7'}">${title} ${invoice.invoiceNumber}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0">
        <thead><tr style="background:#f8f9fa">
          <th style="padding:8px;text-align:left">Description</th>
          <th style="padding:8px;text-align:right">Quantity</th>
          <th style="padding:8px;text-align:right">Price</th>
          <th style="padding:8px;text-align:right">VAT</th>
          <th style="padding:8px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;font-size:13px">
        <p>Subtotal: ${formatCurrency(invoice.subtotal)}</p>
        <p>VAT: ${formatCurrency(invoice.vatAmount)}</p>
        <p style="font-size:18px;font-weight:bold">Total: ${formatCurrency(invoice.total)}</p>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px">Invoice date: ${formatDate(invoice.date)} | Due date: ${formatDate(invoice.dueDate)}</p>
      ${client?.iban ? `<p style="font-size:12px;color:#9ca3af">Payment: ${client.iban} in the name of ${client.accountHolder || client.company || ""}</p>` : ""}
    </div>
  `;

  const sent = await sendEmail({ to, subject, html: emailHtml });

  if (sent) {
    if (invoice.status === "draft") {
      await prisma.invoice.update({ where: { id }, data: { status: "sent" } });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Email could not be sent" }, { status: 500 });
}

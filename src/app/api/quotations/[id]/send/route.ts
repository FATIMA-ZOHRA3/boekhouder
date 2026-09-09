import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";
import { randomUUID } from "crypto";

function fmt(n: number) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n); }
function fmtDate(d: string) { const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; }

// Was previously unauthenticated — anyone could make this app send an email,
// to any address, using this business's own Brevo credits (abuse/spoofing
// risk on top of the data exposure). Ownership-gated like the siblings.
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

  const q = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!q || (!isStaff && q.clientId !== me.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const client = await prisma.user.findUnique({ where: { id: q.clientId } });
  const acceptToken = randomUUID();
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const acceptUrl = `${appUrl}/quotation-accept?token=${acceptToken}`;

  const itemRows = q.items.map((i) => `
    <tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.description}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(i.unitPrice)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(i.quantity * i.unitPrice)}</td></tr>
  `).join("");

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      ${client?.logoUrl ? `<img src="${appUrl}${client.logoUrl}" alt="Logo" style="max-height:50px;margin-bottom:16px">` : ""}
      <p>${message.replace(/\n/g, "<br>")}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <h3 style="color:#2E6FA7">Quotation ${q.quotationNumber}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0">
        <thead><tr style="background:#f8f9fa">
          <th style="padding:6px 8px;text-align:left">Description</th>
          <th style="padding:6px 8px;text-align:right">Quantity</th>
          <th style="padding:6px 8px;text-align:right">Price</th>
          <th style="padding:6px 8px;text-align:right">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;font-size:13px">
        <p>Subtotal: ${fmt(q.subtotal)}</p>
        <p>VAT: ${fmt(q.vatAmount)}</p>
        <p style="font-size:18px;font-weight:bold">Total: ${fmt(q.total)}</p>
      </div>
      <p style="font-size:12px;color:#666">Valid until: ${fmtDate(q.validUntil)}</p>
      <div style="text-align:center;margin:30px 0">
        <a href="${acceptUrl}" style="background:#16a34a;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;display:inline-block">
          Accept quotation
        </a>
      </div>
      <p style="font-size:12px;color:#9ca3af">Click the button to accept this quotation.</p>
    </div>
  `;

  const sent = await sendEmail({ to, subject, html });

  if (sent) {
    await prisma.quotation.update({
      where: { id },
      data: { status: "sent", acceptToken, sentAt: new Date() },
    });
    await logAudit({
      userId: me.id,
      userRole: me.role,
      action: "quotation.send",
      entity: "Quotation",
      entityId: id,
      before: { status: q.status },
      after: { status: "sent" },
      metadata: { to },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Email could not be sent" }, { status: 500 });
}

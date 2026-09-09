import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function fmt(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function fmtDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

async function generatePdfBytes(invoice: {
  invoiceNumber: string; date: string; dueDate: string; customerName: string; customerAddress: string;
  subtotal: number; vatAmount: number; total: number; isCredit: boolean; notes: string | null;
  items: { description: string; quantity: number; unitPrice: number; vatRate: number }[];
}, client: { company?: string | null; name?: string | null; vatNumber?: string | null; kvkNumber?: string | null; iban?: string | null; bankName?: string | null; accountHolder?: string | null } | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();

  const blue = rgb(0.15, 0.39, 0.92);
  const red = rgb(0.86, 0.15, 0.15);
  const gray = rgb(0.4, 0.4, 0.4);
  const black = rgb(0, 0, 0);
  const lightGray = rgb(0.95, 0.95, 0.96);

  const isCredit = invoice.isCredit;
  const title = isCredit ? "Credit note" : "Invoice";
  const titleColor = isCredit ? red : blue;

  let y = height - 50;

  // Title
  page.drawText(title, { x: 50, y, size: 22, font: fontBold, color: titleColor });
  y -= 18;
  page.drawText(invoice.invoiceNumber, { x: 50, y, size: 11, font, color: gray });

  // Company info (right side)
  let cy = height - 50;
  if (client?.company) {
    page.drawText(client.company, { x: 350, y: cy, size: 13, font: fontBold, color: black });
    cy -= 15;
  }
  if (client?.name) { page.drawText(client.name, { x: 350, y: cy, size: 9, font, color: gray }); cy -= 13; }
  if (client?.vatNumber) { page.drawText(`VAT: ${client.vatNumber}`, { x: 350, y: cy, size: 9, font, color: gray }); cy -= 13; }
  if (client?.kvkNumber) { page.drawText(`KvK: ${client.kvkNumber}`, { x: 350, y: cy, size: 9, font, color: gray }); cy -= 13; }

  // Meta section
  y -= 30;
  page.drawText("INVOICE DETAILS", { x: 50, y, size: 8, font, color: gray });
  page.drawText("CUSTOMER", { x: 320, y, size: 8, font, color: gray });
  y -= 16;
  page.drawText(`Factuurdatum: ${fmtDate(invoice.date)}`, { x: 50, y, size: 10, font, color: black });
  page.drawText(invoice.customerName, { x: 320, y, size: 10, font: fontBold, color: black });
  y -= 14;
  page.drawText(`Due date: ${fmtDate(invoice.dueDate)}`, { x: 50, y, size: 10, font, color: black });
  page.drawText(invoice.customerAddress || "", { x: 320, y, size: 10, font, color: black });

  // Table header
  y -= 30;
  page.drawRectangle({ x: 50, y: y - 4, width: 500, height: 18, color: lightGray });
  page.drawText("DESCRIPTION", { x: 55, y, size: 7, font, color: gray });
  page.drawText("QUANTITY", { x: 290, y, size: 7, font, color: gray });
  page.drawText("PRICE", { x: 350, y, size: 7, font, color: gray });
  page.drawText("VAT", { x: 420, y, size: 7, font, color: gray });
  page.drawText("TOTAL", { x: 480, y, size: 7, font, color: gray });

  // Table rows
  y -= 20;
  for (const item of invoice.items) {
    const desc = item.description.length > 35 ? item.description.substring(0, 35) + "..." : item.description;
    page.drawText(desc, { x: 55, y, size: 9, font, color: black });
    page.drawText(item.quantity.toString(), { x: 300, y, size: 9, font, color: black });
    page.drawText(fmt(item.unitPrice), { x: 340, y, size: 9, font, color: black });
    page.drawText(`${item.vatRate}%`, { x: 425, y, size: 9, font, color: black });
    page.drawText(fmt(item.quantity * item.unitPrice), { x: 470, y, size: 9, font, color: black });
    y -= 18;
    page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 550, y: y + 6 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
  }

  // Totals
  y -= 15;
  page.drawText("Subtotal", { x: 390, y, size: 9, font, color: gray });
  page.drawText(fmt(invoice.subtotal), { x: 470, y, size: 9, font, color: black });
  y -= 15;
  page.drawText("VAT", { x: 390, y, size: 9, font, color: gray });
  page.drawText(fmt(invoice.vatAmount), { x: 470, y, size: 9, font, color: black });
  y -= 5;
  page.drawLine({ start: { x: 390, y }, end: { x: 550, y }, thickness: 1.5, color: black });
  y -= 16;
  page.drawText("Total", { x: 390, y, size: 13, font: fontBold, color: black });
  page.drawText(fmt(invoice.total), { x: 470, y, size: 13, font: fontBold, color: black });

  // Notes
  if (invoice.notes) {
    y -= 35;
    page.drawRectangle({ x: 50, y: y - 8, width: 500, height: 30, color: lightGray });
    page.drawText(`Notes: ${invoice.notes.substring(0, 80)}`, { x: 60, y, size: 8, font, color: gray });
  }

  // Payment info
  if (client?.iban) {
    y -= 40;
    page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: 550, y: y + 10 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
    page.drawText(`Payment: ${client.iban}${client.bankName ? ` (${client.bankName})` : ""} in the name of ${client.accountHolder || client.company || ""}`, { x: 50, y, size: 8, font, color: gray });
  }

  return doc.save();
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!invoice) return new Response("Invoice not found", { status: 404 });

  const client = await prisma.user.findUnique({ where: { id: invoice.clientId } });
  const isCredit = invoice.isCredit;
  const title = isCredit ? "Credit note" : "Invoice";

  // Return real PDF file when download=1
  if (download) {
    const pdfBytes = await generatePdfBytes(invoice, client);
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      },
    });
  }

  // Otherwise return HTML preview
  const itemRows = invoice.items.map((item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.description}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(item.unitPrice)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.vatRate}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(item.quantity * item.unitPrice)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} ${invoice.invoiceNumber}</title>
  <style>
    @media print { body { margin: 0; } @page { margin: 20mm; } }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .company { font-size: 14px; color: #666; }
    .company h2 { color: #333; margin: 0 0 8px 0; font-size: 20px; }
    .invoice-title { font-size: 28px; font-weight: bold; color: ${isCredit ? "#dc2626" : "#2E6FA7"}; margin-bottom: 4px; }
    .invoice-number { font-size: 16px; color: #666; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .meta-section h3 { font-size: 12px; text-transform: uppercase; color: #999; margin: 0 0 8px 0; letter-spacing: 0.5px; }
    .meta-section p { margin: 4px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #f8f9fa; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666; border-bottom: 2px solid #e5e7eb; }
    .totals { width: 250px; margin-left: auto; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .totals .total { border-top: 2px solid #333; padding-top: 8px; font-size: 18px; font-weight: bold; }
    .notes { background: #f8f9fa; padding: 16px; border-radius: 8px; margin-top: 30px; font-size: 13px; color: #666; }
    .credit-badge { display: inline-block; background: #fee2e2; color: #dc2626; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-left: 8px; }
    .btn-bar { position: fixed; top: 20px; right: 20px; display: flex; gap: 8px; }
    .btn-bar button, .btn-bar a { background: #2E6FA7; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; text-decoration: none; }
    .btn-bar button:hover, .btn-bar a:hover { background: #245A87; }
    .btn-bar .dl { background: #16a34a; }
    .btn-bar .dl:hover { background: #15803d; }
    @media print { .btn-bar { display: none; } }
  </style>
</head>
<body>
  <div class="btn-bar">
    <a class="dl" href="/api/invoices/${id}/pdf?download=1">Download PDF</a>
    <button onclick="window.print()">Print</button>
  </div>

  <div class="header">
    <div>
      <div class="invoice-title">${title}${isCredit ? '<span class="credit-badge">Credit</span>' : ""}</div>
      <div class="invoice-number">${invoice.invoiceNumber}</div>
    </div>
    <div class="company" style="text-align:right">
      ${client?.logoUrl ? `<img src="${(process.env.APP_URL || 'http://localhost:3000')}${client.logoUrl}" alt="Logo" style="max-height:60px;max-width:200px;margin-left:auto;margin-bottom:8px;display:block">` : ""}
      <h2>${client?.company || ""}</h2>
      <p>${client?.name || ""}</p>
      ${client?.vatNumber ? `<p>VAT: ${client.vatNumber}</p>` : ""}
      ${client?.kvkNumber ? `<p>KvK: ${client.kvkNumber}</p>` : ""}
    </div>
  </div>

  <div class="meta">
    <div class="meta-section">
      <h3>Invoice details</h3>
      <p><strong>Invoice date:</strong> ${fmtDate(invoice.date)}</p>
      <p><strong>Due date:</strong> ${fmtDate(invoice.dueDate)}</p>
    </div>
    <div class="meta-section">
      <h3>Debtor</h3>
      <p><strong>${invoice.customerName}</strong></p>
      <p>${invoice.customerAddress}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right">Quantity</th>
        <th style="text-align:right">Unit price</th>
        <th style="text-align:right">VAT %</th>
        <th style="text-align:right">Line total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(invoice.subtotal)}</span></div>
    <div class="row"><span>VAT</span><span>${fmt(invoice.vatAmount)}</span></div>
    <div class="row total"><span>Total</span><span>${fmt(invoice.total)}</span></div>
  </div>

  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}

  ${client?.iban ? `
  <div style="margin-top:30px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#666">
    <p><strong>Payment:</strong> ${client.iban}${client.bankName ? ` (${client.bankName})` : ""} in the name of ${client.accountHolder || client.company || ""}</p>
  </div>` : ""}
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

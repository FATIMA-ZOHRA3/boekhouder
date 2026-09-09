import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function fmt(n: number) { return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n); }
function fmtDate(d: string) { const p = d.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; }

async function generatePdfBytes(q: {
  quotationNumber: string; date: string; validUntil: string; customerName: string; customerAddress: string;
  subtotal: number; vatAmount: number; total: number; notes: string | null;
  items: { description: string; quantity: number; unitPrice: number; vatRate: number }[];
}, client: { company?: string | null; name?: string | null; vatNumber?: string | null; kvkNumber?: string | null } | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  const blue = rgb(0.15, 0.39, 0.92);
  const gray = rgb(0.4, 0.4, 0.4);
  const black = rgb(0, 0, 0);
  const lightGray = rgb(0.95, 0.95, 0.96);

  let y = height - 50;
  page.drawText("Offerte", { x: 50, y, size: 22, font: fontBold, color: blue });
  y -= 18;
  page.drawText(q.quotationNumber, { x: 50, y, size: 11, font, color: gray });

  let cy = height - 50;
  if (client?.company) { page.drawText(client.company, { x: 350, y: cy, size: 13, font: fontBold, color: black }); cy -= 15; }
  if (client?.name) { page.drawText(client.name, { x: 350, y: cy, size: 9, font, color: gray }); cy -= 13; }
  if (client?.vatNumber) { page.drawText(`VAT: ${client.vatNumber}`, { x: 350, y: cy, size: 9, font, color: gray }); cy -= 13; }

  y -= 30;
  page.drawText("OFFERTEGEGEVENS", { x: 50, y, size: 8, font, color: gray });
  page.drawText("CUSTOMER", { x: 320, y, size: 8, font, color: gray });
  y -= 16;
  page.drawText(`Offertedatum: ${fmtDate(q.date)}`, { x: 50, y, size: 10, font, color: black });
  page.drawText(q.customerName, { x: 320, y, size: 10, font: fontBold, color: black });
  y -= 14;
  page.drawText(`Valid until: ${fmtDate(q.validUntil)}`, { x: 50, y, size: 10, font, color: black });
  page.drawText(q.customerAddress || "", { x: 320, y, size: 10, font, color: black });

  y -= 30;
  page.drawRectangle({ x: 50, y: y - 4, width: 500, height: 18, color: lightGray });
  page.drawText("DESCRIPTION", { x: 55, y, size: 7, font, color: gray });
  page.drawText("QUANTITY", { x: 290, y, size: 7, font, color: gray });
  page.drawText("PRICE", { x: 350, y, size: 7, font, color: gray });
  page.drawText("VAT", { x: 420, y, size: 7, font, color: gray });
  page.drawText("TOTAL", { x: 480, y, size: 7, font, color: gray });
  y -= 20;

  for (const item of q.items) {
    const desc = item.description.length > 35 ? item.description.substring(0, 35) + "..." : item.description;
    page.drawText(desc, { x: 55, y, size: 9, font, color: black });
    page.drawText(item.quantity.toString(), { x: 300, y, size: 9, font, color: black });
    page.drawText(fmt(item.unitPrice), { x: 340, y, size: 9, font, color: black });
    page.drawText(`${item.vatRate}%`, { x: 425, y, size: 9, font, color: black });
    page.drawText(fmt(item.quantity * item.unitPrice), { x: 470, y, size: 9, font, color: black });
    y -= 18;
    page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 550, y: y + 6 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
  }

  y -= 15;
  page.drawText("Subtotal", { x: 390, y, size: 9, font, color: gray });
  page.drawText(fmt(q.subtotal), { x: 470, y, size: 9, font, color: black });
  y -= 15;
  page.drawText("VAT", { x: 390, y, size: 9, font, color: gray });
  page.drawText(fmt(q.vatAmount), { x: 470, y, size: 9, font, color: black });
  y -= 5;
  page.drawLine({ start: { x: 390, y }, end: { x: 550, y }, thickness: 1.5, color: black });
  y -= 16;
  page.drawText("Total", { x: 390, y, size: 13, font: fontBold, color: black });
  page.drawText(fmt(q.total), { x: 470, y, size: 13, font: fontBold, color: black });

  if (q.notes) {
    y -= 35;
    page.drawRectangle({ x: 50, y: y - 8, width: 500, height: 30, color: lightGray });
    page.drawText(`Notes: ${q.notes.substring(0, 80)}`, { x: 60, y, size: 8, font, color: gray });
  }

  return doc.save();
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  const q = await prisma.quotation.findUnique({ where: { id }, include: { items: true } });
  if (!q) return new Response("Not found", { status: 404 });
  const client = await prisma.user.findUnique({ where: { id: q.clientId } });

  if (download) {
    const pdfBytes = await generatePdfBytes(q, client);
    return new Response(Buffer.from(pdfBytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${q.quotationNumber}.pdf"` },
    });
  }

  // HTML preview
  const itemRows = q.items.map((i) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${i.description}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${i.quantity}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(i.unitPrice)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${i.vatRate}%</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(i.quantity * i.unitPrice)}</td></tr>`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quotation ${q.quotationNumber}</title>
<style>body{font-family:-apple-system,sans-serif;color:#333;max-width:800px;margin:0 auto;padding:40px}
.header{display:flex;justify-content:space-between;margin-bottom:40px}
.title{font-size:28px;font-weight:bold;color:#2E6FA7;margin-bottom:4px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:30px}
.meta h3{font-size:12px;text-transform:uppercase;color:#999;margin:0 0 8px}
.meta p{margin:4px 0;font-size:14px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead th{background:#f8f9fa;padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666;border-bottom:2px solid #e5e7eb}
.totals{width:250px;margin-left:auto}.totals .row{display:flex;justify-content:space-between;padding:6px 0;font-size:14px}
.totals .total{border-top:2px solid #333;padding-top:8px;font-size:18px;font-weight:bold}
.btn-bar{position:fixed;top:20px;right:20px;display:flex;gap:8px}
.btn-bar a,.btn-bar button{background:#2E6FA7;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;text-decoration:none}
.btn-bar .dl{background:#16a34a}
@media print{.btn-bar{display:none}}</style></head>
<body><div class="btn-bar"><a class="dl" href="/api/quotations/${id}/pdf?download=1">Download PDF</a><button onclick="window.print()">Print</button></div>
<div class="header"><div><div class="title">Quotation</div><div style="font-size:16px;color:#666">${q.quotationNumber}</div></div>
<div style="text-align:right;font-size:14px;color:#666">${client?.logoUrl ? `<img src="${(process.env.APP_URL || 'http://localhost:3000')}${client.logoUrl}" style="max-height:60px;margin-left:auto;margin-bottom:8px;display:block">` : ""}
<h2 style="margin:0 0 8px;font-size:20px;color:#333">${client?.company || ""}</h2><p>${client?.name || ""}</p>${client?.vatNumber ? `<p>VAT: ${client.vatNumber}</p>` : ""}</div></div>
<div class="meta"><div><h3>Quotation details</h3><p><strong>Quotation date:</strong> ${fmtDate(q.date)}</p><p><strong>Valid until:</strong> ${fmtDate(q.validUntil)}</p></div>
<div><h3>Customer</h3><p><strong>${q.customerName}</strong></p><p>${q.customerAddress}</p></div></div>
<table><thead><tr><th>Description</th><th style="text-align:right">Quantity</th><th style="text-align:right">Unit price</th><th style="text-align:right">VAT %</th><th style="text-align:right">Line total</th></tr></thead><tbody>${itemRows}</tbody></table>
<div class="totals"><div class="row"><span>Subtotal</span><span>${fmt(q.subtotal)}</span></div><div class="row"><span>VAT</span><span>${fmt(q.vatAmount)}</span></div><div class="row total"><span>Total</span><span>${fmt(q.total)}</span></div></div>
${q.notes ? `<div style="background:#f8f9fa;padding:16px;border-radius:8px;margin-top:30px;font-size:13px;color:#666"><strong>Notes:</strong> ${q.notes}</div>` : ""}
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

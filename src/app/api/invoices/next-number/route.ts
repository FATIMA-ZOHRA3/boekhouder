import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const year = new Date().getFullYear().toString();
  const prefix = year;

  // Find the highest invoice number for this year across all invoices for this user
  const latest = await prisma.invoice.findFirst({
    where: {
      clientId: session.userId,
      invoiceNumber: { startsWith: prefix },
    },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  let nextSeq = 1;
  if (latest) {
    const seqPart = latest.invoiceNumber.slice(prefix.length);
    const parsed = parseInt(seqPart, 10);
    if (!isNaN(parsed)) {
      nextSeq = parsed + 1;
    }
  }

  const nextNumber = `${prefix}${nextSeq.toString().padStart(5, "0")}`;

  return Response.json({ invoiceNumber: nextNumber });
}

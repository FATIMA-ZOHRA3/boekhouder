import { prisma } from "@/lib/prisma";

export async function GET() {
  const year = new Date().getFullYear().toString();
  const prefix = `OFF-${year}`;

  const latest = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });

  let nextSeq = 1;
  if (latest) {
    const seqPart = latest.quotationNumber.slice(prefix.length);
    const parsed = parseInt(seqPart, 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }

  return Response.json({ quotationNumber: `${prefix}${nextSeq.toString().padStart(5, "0")}` });
}

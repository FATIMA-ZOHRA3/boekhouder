import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json();
  const { token } = body;

  if (!token) return Response.json({ error: "Token is missing" }, { status: 400 });

  const q = await prisma.quotation.findUnique({ where: { acceptToken: token } });
  if (!q) return Response.json({ error: "Quotation not found" }, { status: 404 });
  if (q.status === "accepted") return Response.json({ error: "Quotation is already accepted" }, { status: 400 });
  if (q.status === "expired") return Response.json({ error: "Quotation has expired" }, { status: 400 });

  await prisma.quotation.update({
    where: { id: q.id },
    data: { status: "accepted", acceptedAt: new Date() },
  });

  return Response.json({ success: true, quotationNumber: q.quotationNumber });
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const documents = await prisma.purchaseDocument.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(documents);
}

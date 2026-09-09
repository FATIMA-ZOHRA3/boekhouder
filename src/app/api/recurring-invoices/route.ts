import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json([], { status: 200 });

  const recurring = await prisma.recurringInvoice.findMany({
    where: { clientId: session.userId },
    include: { customer: { select: { name: true } } },
    orderBy: { nextDate: "asc" },
  });
  return Response.json(recurring);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = await request.json();
  const { customerId, interval, intervalDays, nextDate, templateData, autoSend } = body;

  if (!customerId || !interval || !nextDate) {
    return Response.json({ error: "Customer, interval and start date are required" }, { status: 400 });
  }

  const recurring = await prisma.recurringInvoice.create({
    data: {
      clientId: session.userId,
      customerId,
      interval,
      intervalDays: intervalDays || null,
      nextDate,
      templateData: typeof templateData === "string" ? templateData : JSON.stringify(templateData),
      autoSend: autoSend || false,
    },
    include: { customer: { select: { name: true } } },
  });

  return Response.json(recurring);
}

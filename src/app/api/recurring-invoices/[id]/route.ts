import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  await prisma.recurringInvoice.updateMany({
    where: { id, clientId: session.userId },
    data: {
      ...(body.interval !== undefined && { interval: body.interval }),
      ...(body.nextDate !== undefined && { nextDate: body.nextDate }),
      ...(body.autoSend !== undefined && { autoSend: body.autoSend }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.templateData !== undefined && { templateData: typeof body.templateData === "string" ? body.templateData : JSON.stringify(body.templateData) }),
    },
  });

  return Response.json({ success: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  await prisma.recurringInvoice.deleteMany({ where: { id, clientId: session.userId } });
  return Response.json({ success: true });
}

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const template = await prisma.lineTemplate.updateMany({
    where: { id, userId: session.userId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description.trim() }),
      ...(body.unitPrice !== undefined && { unitPrice: body.unitPrice }),
      ...(body.vatRate !== undefined && { vatRate: body.vatRate }),
    },
  });

  if (template.count === 0) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ success: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  await prisma.lineTemplate.deleteMany({ where: { id, userId: session.userId } });
  return Response.json({ success: true });
}

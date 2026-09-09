import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, userId: session.userId } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.completed !== undefined) {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
  }
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.date !== undefined) data.date = body.date;
  if (body.time !== undefined) data.time = body.time || null;

  const updated = await prisma.task.update({ where: { id }, data });
  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, userId: session.userId } });
  if (!task) return Response.json({ error: "Task not found" }, { status: 404 });

  await prisma.task.delete({ where: { id } });
  return Response.json({ success: true });
}

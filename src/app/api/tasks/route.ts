import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get("date"); // YYYY-MM-DD
  const includeOverdue = url.searchParams.get("includeOverdue") === "true";
  // Staff clientId scoping added for the new bookkeeper Tasks page
  // (CONTROL > Tasks) — this route previously always scoped to
  // session.userId, so a bookkeeper could create tasks for a customer
  // (see POST below, which already supported this) but never list them
  // back. Mirrors the isStaff pattern used by GET /api/purchases/all.
  const isStaff = session.role === "bookkeeper" || session.role === "admin";
  const requestedClientId = url.searchParams.get("clientId");
  const effectiveUserId = isStaff && requestedClientId ? requestedClientId : session.userId;

  const where: Record<string, unknown> = { userId: effectiveUserId };

  if (date) {
    if (includeOverdue) {
      // Get tasks for the selected date + all uncompleted past tasks (carry-forward)
      const tasks = await prisma.task.findMany({
        where: {
          userId: effectiveUserId,
          OR: [
            { date },
            { date: { lt: date }, completed: false },
          ],
        },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      });
      return Response.json(tasks);
    } else {
      where.date = date;
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ date: "asc" }, { time: "asc" }],
  });

  return Response.json(tasks);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = await request.json();
  const { title, description, date, time, category, userId, assignedTo, sourceType, sourceId, conversationId } = body;

  if (!title?.trim() || !date) {
    return Response.json({ error: "Title and date are required" }, { status: 400 });
  }

  // Allow bookkeeper/admin to create tasks for other users
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const isAccountant = user && (user.role === "bookkeeper" || user.role === "admin");
  const targetUserId = (isAccountant && userId) ? userId : session.userId;

  const task = await prisma.task.create({
    data: {
      userId: targetUserId,
      title: title.trim(),
      description: description?.trim() || null,
      date,
      time: time || null,
      category: category || null,
      assignedTo: assignedTo || null,
      createdByUserId: session.userId,
      sourceType: sourceType || "manual",
      sourceId: sourceId || null,
      conversationId: conversationId || null,
    },
  });

  return Response.json(task);
}

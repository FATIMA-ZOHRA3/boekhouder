import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const isAccountant = user.role === "bookkeeper" || user.role === "admin";

  const conversation = await prisma.conversation.findFirst({
    where: isAccountant ? { id } : { id, userId: session.userId },
    include: {
      user: { select: { id: true, name: true, company: true } },
      messages: {
        include: { sender: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

  // Mark as read
  if (user.role === "client" && conversation.unreadByUser) {
    await prisma.conversation.update({ where: { id }, data: { unreadByUser: false } });
  }
  if (isAccountant && conversation.unreadByAccountant) {
    await prisma.conversation.update({ where: { id }, data: { unreadByAccountant: false } });
  }

  return Response.json(conversation);
}

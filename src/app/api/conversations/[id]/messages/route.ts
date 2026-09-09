import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const isAccountant = user.role === "bookkeeper" || user.role === "admin";
  const conversation = await prisma.conversation.findFirst({
    where: isAccountant ? { id } : { id, userId: session.userId },
  });
  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const body = await request.json();
  if (!body.text?.trim()) return Response.json({ error: "Message is required" }, { status: 400 });

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      senderUserId: session.userId,
      senderRole: user.role === "client" ? "client" : "bookkeeper",
      text: body.text.trim(),
    },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  // Update conversation
  await prisma.conversation.update({
    where: { id },
    data: {
      lastMessage: body.text.trim().substring(0, 100),
      lastAt: new Date(),
      unreadByUser: isAccountant,
      unreadByAccountant: !isAccountant,
    },
  });

  return Response.json(message);
}

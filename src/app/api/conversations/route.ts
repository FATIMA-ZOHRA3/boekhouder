import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const isAccountant = user.role === "bookkeeper" || user.role === "admin";

  const conversations = await prisma.conversation.findMany({
    where: isAccountant ? {} : { userId: session.userId },
    include: { user: { select: { id: true, name: true, company: true } } },
    orderBy: { lastAt: "desc" },
  });

  return Response.json(conversations);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = await request.json();
  const { subject, message, contextType, contextId } = body;

  if (!subject?.trim() || !message?.trim()) {
    return Response.json({ error: "Subject and message are required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.create({
    data: {
      userId: session.userId,
      subject: subject.trim(),
      lastMessage: message.trim().substring(0, 100),
      lastAt: new Date(),
      unreadByAccountant: true,
      contextType: contextType || null,
      contextId: contextId || null,
      messages: {
        create: {
          senderUserId: session.userId,
          senderRole: user.role === "client" ? "client" : "bookkeeper",
          text: message.trim(),
        },
      },
    },
    include: { user: { select: { id: true, name: true, company: true } } },
  });

  return Response.json(conversation);
}

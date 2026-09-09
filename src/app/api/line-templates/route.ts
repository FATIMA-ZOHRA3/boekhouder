import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json([], { status: 200 });

  const templates = await prisma.lineTemplate.findMany({
    where: { userId: session.userId },
    orderBy: { name: "asc" },
  });
  return Response.json(templates);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = await request.json();
  const { name, description, unitPrice, vatRate } = body;

  if (!name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });

  const template = await prisma.lineTemplate.create({
    data: {
      userId: session.userId,
      name: name.trim(),
      description: description?.trim() || "",
      unitPrice: unitPrice || 0,
      vatRate: vatRate ?? 21,
    },
  });

  return Response.json(template);
}

import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Not logged in" }, { status: 401 });
  }

  const check = await requirePermission(session, "admin.users.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      company: true,
      kvkNumber: true,
      legalForm: true,
      phone: true,
      emailVerified: true,
      isNew: true,
      createdAt: true,
      username: true,
      vatNumber: true,
      vatObligation: true,
      iban: true,
      bankName: true,
      accountHolder: true,
    },
  });

  return Response.json(users);
}

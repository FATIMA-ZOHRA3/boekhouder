import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "bank.reconcile");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const body = await request.json();

  const tx = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!tx) return Response.json({ error: "Transaction not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;

  const updated = await prisma.bankTransaction.update({
    where: { id },
    data,
    include: { user: { select: { id: true, name: true, company: true } } },
  });

  return Response.json(updated);
}

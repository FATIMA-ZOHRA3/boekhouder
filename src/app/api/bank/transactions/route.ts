import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "bank.read");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const url = new URL(request.url);
  const clientFilter = url.searchParams.get("clientId");
  const statusFilter = url.searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (clientFilter && clientFilter !== "all") where.userId = clientFilter;
  if (statusFilter && statusFilter !== "all") where.status = statusFilter;

  const transactions = await prisma.bankTransaction.findMany({
    where,
    include: { user: { select: { id: true, name: true, company: true } } },
    orderBy: { transactionDate: "desc" },
  });

  return Response.json(transactions);
}

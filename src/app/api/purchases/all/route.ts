import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Accountant endpoint: fetch ALL purchase documents across all clients
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  // Verify user is bookkeeper or admin
  const check = await requirePermission(session, "purchase.read");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const clientFilter = url.searchParams.get("clientId");

  const where: Record<string, unknown> = {};
  if (statusFilter && statusFilter !== "all") where.status = statusFilter;
  if (clientFilter && clientFilter !== "all") where.userId = clientFilter;

  const documents = await prisma.purchaseDocument.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, company: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(documents);
}

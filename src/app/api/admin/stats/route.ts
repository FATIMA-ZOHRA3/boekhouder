import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Not logged in" }, { status: 401 });
  }

  const check = await requirePermission(session, "admin.stats.read");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const [totalUsers, totalClients, totalBookkeepers, totalInvoices, newClients, verifiedUsers, unverifiedUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "client" } }),
      prisma.user.count({ where: { role: "bookkeeper" } }),
      prisma.invoice.count(),
      prisma.user.count({ where: { role: "client", isNew: true } }),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { emailVerified: false } }),
    ]);

  const recentUsers = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, name: true, email: true, role: true, createdAt: true, emailVerified: true, company: true },
  });

  const totalRevenue = await prisma.invoice.aggregate({
    _sum: { total: true },
  });

  return Response.json({
    totalUsers,
    totalClients,
    totalBookkeepers,
    totalInvoices,
    newClients,
    verifiedUsers,
    unverifiedUsers,
    totalRevenue: totalRevenue._sum.total || 0,
    recentUsers,
  });
}

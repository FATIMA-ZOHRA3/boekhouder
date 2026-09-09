import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "cash.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const url = new URL(request.url);
  const clientFilter = url.searchParams.get("clientId");
  const statusFilter = url.searchParams.get("status");

  if (!clientFilter || clientFilter === "all") {
    return Response.json({ error: "clientId is required" }, { status: 400 });
  }

  const where: Record<string, unknown> = { userId: clientFilter };
  if (statusFilter && statusFilter !== "all") where.status = statusFilter;

  const transactions = await prisma.cashTransaction.findMany({
    where,
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
  });

  // Running balance, oldest first, then reversed back to the requested (newest-first) order.
  const chronological = [...transactions].reverse();
  let balance = 0;
  const withBalance = chronological.map((tx) => {
    balance += tx.direction === "in" ? tx.amount : -tx.amount;
    return { ...tx, runningBalance: balance };
  });

  return Response.json({
    transactions: withBalance.reverse(),
    balance,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "cash.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const body = await request.json();
  const { clientId, transactionDate, amount, direction, description, category, notes } = body as {
    clientId?: string;
    transactionDate?: string;
    amount?: number;
    direction?: string;
    description?: string;
    category?: string;
    notes?: string;
  };

  if (!clientId || !transactionDate || !description || amount === undefined || !["in", "out"].includes(direction || "")) {
    return Response.json({ error: "clientId, transactionDate, description, amount and direction (in/out) are required" }, { status: 400 });
  }
  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    return Response.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const client = await prisma.user.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return Response.json({ error: "Client not found" }, { status: 404 });

  const tx = await prisma.cashTransaction.create({
    data: {
      userId: clientId,
      transactionDate,
      amount,
      direction,
      description: description.trim(),
      category: category?.trim() || null,
      notes: notes?.trim() || null,
      createdByUserId: session.userId,
    },
  });

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  await logAudit({
    userId: session.userId,
    userRole: me?.role ?? null,
    action: "cash.create",
    entity: "CashTransaction",
    entityId: tx.id,
    after: tx,
  });

  return Response.json(tx, { status: 201 });
}

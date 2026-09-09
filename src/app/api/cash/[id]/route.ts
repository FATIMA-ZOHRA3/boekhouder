import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "cash.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.cashTransaction.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Transaction not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.transactionDate) data.transactionDate = body.transactionDate;
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.category !== undefined) data.category = body.category?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (Number.isNaN(amount) || amount <= 0) return Response.json({ error: "amount must be a positive number" }, { status: 400 });
    data.amount = amount;
  }
  if (body.direction !== undefined) {
    if (!["in", "out"].includes(body.direction)) return Response.json({ error: "direction must be 'in' or 'out'" }, { status: 400 });
    data.direction = body.direction;
  }
  if (body.status !== undefined) {
    if (!["open", "reconciled"].includes(body.status)) return Response.json({ error: "status must be 'open' or 'reconciled'" }, { status: 400 });
    data.status = body.status;
    data.reconciledAt = body.status === "reconciled" ? new Date() : null;
  }

  const updated = await prisma.cashTransaction.update({ where: { id }, data });

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  await logAudit({
    userId: session.userId,
    userRole: me?.role ?? null,
    action: body.status ? "cash.reconcile" : "cash.update",
    entity: "CashTransaction",
    entityId: id,
    before: existing,
    after: updated,
  });

  return Response.json(updated);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "cash.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const existing = await prisma.cashTransaction.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Transaction not found" }, { status: 404 });

  await prisma.cashTransaction.delete({ where: { id } });

  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  await logAudit({
    userId: session.userId,
    userRole: me?.role ?? null,
    action: "cash.delete",
    entity: "CashTransaction",
    entityId: id,
    before: existing,
  });

  return Response.json({ ok: true });
}

import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

// GET: single journal entry
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "journal.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { lines: true },
  });

  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(entry);
}

// PATCH: update journal entry (only drafts)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "journal.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const existing = await prisma.journalEntry.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // If marking as booked
  if (body.status === "booked" && existing.status === "draft") {
    const entry = await prisma.journalEntry.update({
      where: { id },
      data: { status: "booked", bookedAt: new Date() },
      include: { lines: true },
    });
    await logAudit({
      userId: check.user.id,
      userRole: check.user.role,
      action: "journal.book",
      entity: "JournalEntry",
      entityId: id,
      before: { status: "draft" },
      after: { status: "booked" },
    });
    return Response.json(entry);
  }

  // If reopening
  if (body.status === "draft" && existing.status === "booked") {
    const entry = await prisma.journalEntry.update({
      where: { id },
      data: { status: "draft", bookedAt: null },
      include: { lines: true },
    });
    await logAudit({
      userId: check.user.id,
      userRole: check.user.role,
      action: "journal.reopen",
      entity: "JournalEntry",
      entityId: id,
      before: { status: "booked" },
      after: { status: "draft" },
    });
    return Response.json(entry);
  }

  // Full update (only drafts)
  if (existing.status !== "draft") {
    return Response.json({ error: "Only draft entries can be edited" }, { status: 400 });
  }

  const { date, description, type, lines } = body as {
    date?: string;
    description?: string;
    type?: string;
    lines?: { ledgerAccount: string; debit: number; credit: number; description?: string; vatCode?: string }[];
  };

  const updateData: Record<string, unknown> = {};
  if (date) updateData.date = date;
  if (description) updateData.description = description;
  if (type) updateData.type = type;

  if (lines && lines.length > 0) {
    const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return Response.json({ error: "Debit and credit are not balanced" }, { status: 400 });
    }

    updateData.totalDebit = totalDebit;
    updateData.totalCredit = totalCredit;

    // Delete old lines and create new ones
    await prisma.journalLine.deleteMany({ where: { journalEntryId: id } });
    await prisma.journalLine.createMany({
      data: lines.map((l) => ({
        journalEntryId: id,
        ledgerAccount: l.ledgerAccount,
        debit: l.debit || 0,
        credit: l.credit || 0,
        description: l.description || null,
        vatCode: l.vatCode || null,
      })),
    });
  }

  const entry = await prisma.journalEntry.update({
    where: { id },
    data: updateData,
    include: { lines: true },
  });

  if (Object.keys(updateData).length > 0) {
    await logAudit({
      userId: check.user.id,
      userRole: check.user.role,
      action: "journal.update",
      entity: "JournalEntry",
      entityId: id,
      before: { date: existing.date, description: existing.description, totalDebit: existing.totalDebit, totalCredit: existing.totalCredit },
      after: { date: entry.date, description: entry.description, totalDebit: entry.totalDebit, totalCredit: entry.totalCredit },
    });
  }

  return Response.json(entry);
}

// DELETE: delete journal entry (only drafts)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "journal.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const existing = await prisma.journalEntry.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  if (existing.status !== "draft") {
    return Response.json({ error: "Only draft entries can be deleted" }, { status: 400 });
  }

  await prisma.journalEntry.delete({ where: { id } });

  await logAudit({
    userId: check.user.id,
    userRole: check.user.role,
    action: "journal.delete",
    entity: "JournalEntry",
    entityId: id,
    before: { reference: existing.reference, type: existing.type, totalDebit: existing.totalDebit, totalCredit: existing.totalCredit },
  });

  return Response.json({ success: true });
}

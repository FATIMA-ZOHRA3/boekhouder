import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

// GET: list all journal entries
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "journal.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const entries = await prisma.journalEntry.findMany({
    include: { lines: true },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(entries);
}

// POST: create a new journal entry
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "journal.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const body = await request.json();
  const { date, description, type, lines } = body as {
    date: string;
    description: string;
    type?: string;
    lines: { ledgerAccount: string; debit: number; credit: number; description?: string; vatCode?: string }[];
  };

  if (!date || !description || !lines || lines.length === 0) {
    return Response.json({ error: "Required fields are missing" }, { status: 400 });
  }

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  // Debit must equal credit
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return Response.json({ error: "Debit and credit are not balanced" }, { status: 400 });
  }

  // Generate reference number
  const entryType = type || "memoriaal";
  const prefix = entryType === "beginbalans" ? "BB" : "MEM";
  const count = await prisma.journalEntry.count({ where: { type: entryType } });
  const reference = `${prefix}-${String(count + 1).padStart(3, "0")}`;

  const entry = await prisma.journalEntry.create({
    data: {
      date,
      reference,
      description,
      type: entryType,
      totalDebit,
      totalCredit,
      status: "draft",
      lines: {
        create: lines.map((l) => ({
          ledgerAccount: l.ledgerAccount,
          debit: l.debit || 0,
          credit: l.credit || 0,
          description: l.description || null,
          vatCode: l.vatCode || null,
        })),
      },
    },
    include: { lines: true },
  });

  await logAudit({
    userId: check.user.id,
    userRole: check.user.role,
    action: "journal.create",
    entity: "JournalEntry",
    entityId: entry.id,
    after: { reference: entry.reference, type: entry.type, totalDebit: entry.totalDebit, totalCredit: entry.totalCredit },
  });

  return Response.json(entry);
}

import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseMT940, transactionHash } from "@/lib/mt940";
import { notificationTemplates } from "@/lib/notifications";
import { logAudit } from "@/lib/auditLog";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "bank.import");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("clientId") as string | null;

  if (!file) return Response.json({ error: "No file uploaded" }, { status: 400 });
  if (!clientId) return Response.json({ error: "Select a customer" }, { status: 400 });

  // Verify client exists
  const client = await prisma.user.findUnique({ where: { id: clientId } });
  if (!client) return Response.json({ error: "Customer not found" }, { status: 404 });

  const content = await file.text();

  if (!content.includes(":20:") && !content.includes(":25:") && !content.includes(":61:")) {
    return Response.json({ error: "Invalid file format. This does not appear to be a valid MT940 file." }, { status: 400 });
  }

  const result = parseMT940(content);
  if (!result.success) {
    return Response.json({ error: result.error || "MT940 file could not be processed" }, { status: 400 });
  }

  const batchId = `${clientId}-${Date.now()}`;
  let imported = 0;
  let duplicates = 0;

  for (const t of result.transactions) {
    const hash = transactionHash(clientId, t);

    try {
      await prisma.bankTransaction.create({
        data: {
          userId: clientId,
          bankAccount: t.bankAccount || result.bankAccount || null,
          transactionDate: t.date,
          amount: t.amount,
          direction: t.direction,
          description: t.description,
          counterparty: t.counterparty || null,
          counterpartyAccount: t.counterpartyAccount || null,
          status: "new",
          importBatchId: batchId,
          importHash: hash,
          rawData: t.rawData,
        },
      });
      imported++;
    } catch (err) {
      // Unique constraint violation = duplicate
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
        duplicates++;
      } else {
        throw err;
      }
    }
  }

  // Create notification for bank import
  if (imported > 0 && session.userId) {
    notificationTemplates.bankImport(session.userId, imported, result.bankAccount || "unknown").catch(() => {});
  }

  // One entry per batch, not per transaction — a statement can contain
  // hundreds of rows and this is a single user action.
  if (imported > 0) {
    await logAudit({
      userId: session.userId,
      userRole: session.role,
      action: "bank.import",
      entity: "BankTransaction",
      entityId: batchId,
      after: { imported, duplicates, bankAccount: result.bankAccount ?? null, dateRange: result.dateRange ?? null },
      metadata: { clientId, total: result.transactions.length },
    });
  }

  return Response.json({
    success: true,
    imported,
    duplicates,
    total: result.transactions.length,
    bankAccount: result.bankAccount,
    dateRange: result.dateRange,
    message: duplicates > 0
      ? `${imported} transaction(s) imported, ${duplicates} duplicate(s) skipped.`
      : `${imported} transaction(s) imported successfully.`,
  });
}

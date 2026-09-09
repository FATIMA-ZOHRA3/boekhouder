import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notificationTemplates } from "@/lib/notifications";
import { logAudit } from "@/lib/auditLog";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "bank.reconcile");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const body = await request.json();
  const { invoiceIds, purchaseDocIds, bankTransactionIds } = body as {
    invoiceIds?: string[];
    purchaseDocIds?: string[];
    bankTransactionIds?: string[];
  };

  if ((!invoiceIds?.length && !purchaseDocIds?.length) || !bankTransactionIds?.length) {
    return Response.json({ error: "Select documents and bank transactions to reconcile" }, { status: 400 });
  }

  try {
    // Update invoice statuses
    if (invoiceIds?.length) {
      await prisma.invoice.updateMany({
        where: { id: { in: invoiceIds } },
        data: { bookkeepingStatus: "reconciled", status: "paid" },
      });
    }

    // Update purchase document statuses
    if (purchaseDocIds?.length) {
      await prisma.purchaseDocument.updateMany({
        where: { id: { in: purchaseDocIds } },
        data: { status: "booked", bookedAt: new Date() },
      });
    }

    // Update bank transaction statuses
    await prisma.bankTransaction.updateMany({
      where: { id: { in: bankTransactionIds } },
      data: { status: "reconciled" },
    });

    // Create notification for reconciliation
    const totalDocs = (invoiceIds?.length || 0) + (purchaseDocIds?.length || 0);
    if (totalDocs > 0 && session.userId) {
      notificationTemplates.bankReconciled(session.userId, totalDocs).catch(() => {});
    }

    const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
    for (const txId of bankTransactionIds) {
      await logAudit({
        userId: session.userId,
        userRole: me?.role ?? null,
        action: "bank.reconcile",
        entity: "BankTransaction",
        entityId: txId,
        after: { status: "reconciled" },
        metadata: {
          matchedInvoiceIds: invoiceIds ?? [],
          matchedPurchaseDocIds: purchaseDocIds ?? [],
        },
      });
    }

    return Response.json({
      success: true,
      reconciled: {
        invoices: invoiceIds?.length || 0,
        purchaseDocs: purchaseDocIds?.length || 0,
        bankTransactions: bankTransactionIds?.length || 0,
      },
      message: "Reconciliation completed successfully.",
    });
  } catch {
    return Response.json({ error: "Something went wrong while reconciling" }, { status: 500 });
  }
}

import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { notificationTemplates } from "@/lib/notifications";
import { computeExceptionSeverity } from "@/lib/exceptionSeverity";

// Row shapes for the two queries below. Explicit here rather than
// implicit `any` because `@/lib/prisma`'s generated types aren't
// available in every environment this runs in (see prisma/schema.prisma
// generator output) — annotating keeps this file type-safe regardless.
interface ExceptionItemRow {
  id: string;
  userId: string;
  createdByUserId: string;
  type: string;
  title: string;
  description: string;
  status: string;
  invoiceId: string | null;
  purchaseDocId: string | null;
  bankTransactionId: string | null;
  customerResponse: string | null;
  customerNotes: string | null;
  customerFileUrl: string | null;
  customerFileName: string | null;
  respondedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; company: string | null; email: string };
  createdBy: { id: string; name: string };
}
interface InvoiceAmountRow { id: string; total: number }
interface PurchaseDocAmountRow { id: string; totalAmount: number | null }
interface BankTxAmountRow { id: string; amount: number }

// GET: list exceptions (accountant sees all, client sees their own)
//
// Each item is enriched with two derived fields that do NOT exist on the
// Prisma model (no migration was made for these — see
// src/lib/exceptionSeverity.ts for why):
//   - amount:   resolved from whichever linked record is set
//               (invoice / purchase document / bank transaction), via a
//               batch fetch (3 queries total, not N+1).
//   - severity: "critical" | "high" | "medium" | "low", derived from
//               type + age + status + amount.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const isAccountant = user.role === "bookkeeper" || user.role === "admin";

  const items = (await prisma.exceptionItem.findMany({
    where: isAccountant ? {} : { userId: session.userId },
    include: {
      user: { select: { id: true, name: true, company: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })) as ExceptionItemRow[];

  // Batch-fetch linked amounts — 3 queries regardless of item count.
  const invoiceIds = [...new Set(items.map((i: ExceptionItemRow) => i.invoiceId).filter((id: string | null): id is string => !!id))];
  const purchaseDocIds = [...new Set(items.map((i: ExceptionItemRow) => i.purchaseDocId).filter((id: string | null): id is string => !!id))];
  const bankTransactionIds = [...new Set(items.map((i: ExceptionItemRow) => i.bankTransactionId).filter((id: string | null): id is string => !!id))];

  const [invoiceList, purchaseDocList, bankTxList] = await Promise.all([
    invoiceIds.length
      ? ((await prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, total: true } })) as InvoiceAmountRow[])
      : ([] as InvoiceAmountRow[]),
    purchaseDocIds.length
      ? ((await prisma.purchaseDocument.findMany({ where: { id: { in: purchaseDocIds } }, select: { id: true, totalAmount: true } })) as PurchaseDocAmountRow[])
      : ([] as PurchaseDocAmountRow[]),
    bankTransactionIds.length
      ? ((await prisma.bankTransaction.findMany({ where: { id: { in: bankTransactionIds } }, select: { id: true, amount: true } })) as BankTxAmountRow[])
      : ([] as BankTxAmountRow[]),
  ]);

  const invoiceAmountById = new Map<string, number>(invoiceList.map((inv: InvoiceAmountRow) => [inv.id, inv.total]));
  const purchaseDocAmountById = new Map<string, number | null>(purchaseDocList.map((doc: PurchaseDocAmountRow) => [doc.id, doc.totalAmount]));
  const bankTxAmountById = new Map<string, number>(bankTxList.map((tx: BankTxAmountRow) => [tx.id, tx.amount]));

  const enriched = items.map((item: ExceptionItemRow) => {
    const amount: number | null =
      (item.invoiceId ? invoiceAmountById.get(item.invoiceId) : undefined) ??
      (item.purchaseDocId ? purchaseDocAmountById.get(item.purchaseDocId) : undefined) ??
      (item.bankTransactionId ? bankTxAmountById.get(item.bankTransactionId) : undefined) ??
      null;

    const severity = computeExceptionSeverity({
      type: item.type,
      status: item.status,
      createdAt: item.createdAt,
      amount,
    });

    return { ...item, amount, severity };
  });

  return Response.json(enriched);
}

// POST: create exception (accountant only)
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "exception.create");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const body = await request.json();
  const { userId, type, title, description, invoiceId, purchaseDocId, bankTransactionId } = body;

  if (!userId || !type || !title || !description) {
    return Response.json({ error: "Required fields are missing" }, { status: 400 });
  }

  const item = await prisma.exceptionItem.create({
    data: {
      userId,
      createdByUserId: session.userId,
      type,
      title,
      description,
      status: "waiting",
      invoiceId: invoiceId || null,
      purchaseDocId: purchaseDocId || null,
      bankTransactionId: bankTransactionId || null,
    },
    include: {
      user: { select: { id: true, name: true, company: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  // Notify the bookkeeper who created it
  notificationTemplates.exceptionCreated(session.userId, title, item.user.name).catch(() => {});

  return Response.json(item);
}

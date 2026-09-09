import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "invoice.book");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const body = await request.json();
  const { invoiceIds, bookkeepingStatus, category, ledgerAccountId, vatType } = body;

  if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
    return Response.json({ error: "No invoices selected" }, { status: 400 });
  }

  if (!bookkeepingStatus) {
    return Response.json({ error: "Entry status is required" }, { status: 400 });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    bookkeepingStatus,
    ...(category !== undefined && { category }),
    ...(ledgerAccountId !== undefined && { ledgerAccountId }),
    ...(vatType !== undefined && { vatType }),
    ...(bookkeepingStatus === "booked" ? { bookedAt: now } : { bookedAt: null }),
  };

  const result = await prisma.invoice.updateMany({
    where: { id: { in: invoiceIds } },
    data: updateData,
  });

  return Response.json({
    success: true,
    count: result.count,
    message: `${result.count} invoices processed`,
  });
}

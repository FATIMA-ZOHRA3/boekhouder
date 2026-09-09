import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { unlink } from "fs/promises";
import path from "path";

async function getDoc(id: string, userId: string) {
  // Check if user owns the doc or is bookkeeper/admin
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  if (user.role === "bookkeeper" || user.role === "admin") {
    return prisma.purchaseDocument.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, company: true, email: true } } },
    });
  }
  return prisma.purchaseDocument.findFirst({ where: { id, userId } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const doc = await getDoc(id, session.userId);
  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });
  return Response.json(doc);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;

  // Clients can only update their own docs (limited fields)
  // Bookkeepers/admins can update any doc (all fields)
  const isAccountant = user.role === "bookkeeper" || user.role === "admin";

  const doc = isAccountant
    ? await prisma.purchaseDocument.findUnique({ where: { id } })
    : await prisma.purchaseDocument.findFirst({ where: { id, userId: session.userId } });

  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });

  const body = await request.json();
  const { status, supplierName, invoiceNumber, amount, vatAmount, totalAmount, documentDate, category, description, vatType, notes } = body;

  const data: Record<string, unknown> = {};

  if (status !== undefined) {
    data.status = status;
    if (status === "booked") data.bookedAt = new Date();
    if (status !== "booked") data.bookedAt = null;
  }

  // Only accountants can set bookkeeping metadata
  if (isAccountant) {
    if (supplierName !== undefined) data.supplierName = supplierName || null;
    if (invoiceNumber !== undefined) data.invoiceNumber = invoiceNumber || null;
    if (amount !== undefined) data.amount = amount || null;
    if (vatAmount !== undefined) data.vatAmount = vatAmount || null;
    if (totalAmount !== undefined) data.totalAmount = totalAmount || null;
    if (documentDate !== undefined) data.documentDate = documentDate || null;
    if (category !== undefined) data.category = category || null;
    if (description !== undefined) data.description = description || null;
    if (vatType !== undefined) data.vatType = vatType || null;
    if (notes !== undefined) data.notes = notes || null;
  }

  const updated = await prisma.purchaseDocument.update({
    where: { id },
    data,
    include: { user: { select: { id: true, name: true, company: true, email: true } } },
  });

  if (Object.keys(data).length > 0) {
    await logAudit({
      userId: session.userId,
      userRole: user.role,
      action: status === "booked" ? "purchase.book" : "purchase.update",
      entity: "PurchaseDocument",
      entityId: id,
      before: { status: doc.status, category: doc.category, totalAmount: doc.totalAmount },
      after: { status: updated.status, category: updated.category, totalAmount: updated.totalAmount },
    });
  }

  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.purchaseDocument.findFirst({
    where: { id, userId: session.userId },
  });

  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });

  try {
    const filePath = path.join(process.cwd(), "public", doc.fileUrl);
    await unlink(filePath);
  } catch { /* file may not exist */ }

  await prisma.purchaseDocument.delete({ where: { id } });
  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "purchase.delete",
    entity: "PurchaseDocument",
    entityId: id,
    before: { supplierName: doc.supplierName, status: doc.status, totalAmount: doc.totalAmount },
  });
  return Response.json({ success: true });
}

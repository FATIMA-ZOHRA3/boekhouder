import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "vat.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const vatCode = await prisma.vatCode.findUnique({
    where: { id },
    include: { ledgerAccount: true },
  });

  if (!vatCode) return Response.json({ error: "VAT code not found" }, { status: 404 });
  return Response.json(vatCode);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "vat.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const vatCode = await prisma.vatCode.findUnique({ where: { id } });
  if (!vatCode) return Response.json({ error: "VAT code not found" }, { status: 404 });

  const body = await request.json();
  const { code, name, description, percentage, type, rubricCode, ledgerAccountId, isActive } = body;

  // System VAT codes: restrict changing code and type
  if (vatCode.isSystem) {
    if (code !== undefined && code !== vatCode.code) {
      return Response.json({ error: "System VAT code's code cannot be changed" }, { status: 400 });
    }
    if (type !== undefined && type !== vatCode.type) {
      return Response.json({ error: "System VAT code's type cannot be changed" }, { status: 400 });
    }
  }

  // Check unique code if changed
  if (code !== undefined && code !== vatCode.code) {
    const existing = await prisma.vatCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (existing) {
      return Response.json({ error: "VAT code already exists" }, { status: 400 });
    }
  }

  const updated = await prisma.vatCode.update({
    where: { id },
    data: {
      ...(code !== undefined && { code: code.trim().toUpperCase() }),
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(percentage !== undefined && { percentage: parseFloat(percentage) }),
      ...(type !== undefined && { type }),
      ...(rubricCode !== undefined && { rubricCode: rubricCode || null }),
      ...(ledgerAccountId !== undefined && { ledgerAccountId: ledgerAccountId || null }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { ledgerAccount: true },
  });

  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "vat.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const vatCode = await prisma.vatCode.findUnique({ where: { id } });
  if (!vatCode) return Response.json({ error: "VAT code not found" }, { status: 404 });

  if (vatCode.isSystem) {
    return Response.json({ error: "System VAT code cannot be deleted" }, { status: 400 });
  }

  // Check if any ledger accounts use this as default
  const linkedAccounts = await prisma.ledgerAccount.count({ where: { vatCodeId: id } });
  if (linkedAccounts > 0) {
    return Response.json({ error: "VAT code is used as default and cannot be deleted" }, { status: 400 });
  }

  await prisma.vatCode.delete({ where: { id } });
  return Response.json({ success: true });
}

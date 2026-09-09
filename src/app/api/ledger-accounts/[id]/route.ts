import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "ledger.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const account = await prisma.ledgerAccount.findUnique({
    where: { id },
    include: { defaultVatCode: true, vatCodesPosting: true },
  });

  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  return Response.json(account);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "ledger.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const account = await prisma.ledgerAccount.findUnique({ where: { id } });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  const body = await request.json();
  const { accountNumber, name, description, accountType, category, statementSection, normalBalance, isBalanceSheet, isActive, vatCodeId, sortOrder } = body;

  // System accounts: restrict changing accountNumber and accountType
  if (account.isSystem) {
    if (accountNumber !== undefined && accountNumber !== account.accountNumber) {
      return Response.json({ error: "System account number cannot be changed" }, { status: 400 });
    }
    if (accountType !== undefined && accountType !== account.accountType) {
      return Response.json({ error: "System account type cannot be changed" }, { status: 400 });
    }
  }

  // Check unique accountNumber if changed
  if (accountNumber !== undefined && accountNumber !== account.accountNumber) {
    if (!/^\d{4}$/.test(accountNumber)) {
      return Response.json({ error: "Account number must be 4 digits" }, { status: 400 });
    }
    const existing = await prisma.ledgerAccount.findUnique({ where: { accountNumber } });
    if (existing) {
      return Response.json({ error: "Account number already exists" }, { status: 400 });
    }
  }

  const updated = await prisma.ledgerAccount.update({
    where: { id },
    data: {
      ...(accountNumber !== undefined && { accountNumber }),
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(accountType !== undefined && { accountType }),
      ...(category !== undefined && { category: category.trim() }),
      ...(statementSection !== undefined && { statementSection: statementSection?.trim() || null }),
      ...(normalBalance !== undefined && { normalBalance }),
      ...(isBalanceSheet !== undefined && { isBalanceSheet }),
      ...(isActive !== undefined && { isActive }),
      ...(vatCodeId !== undefined && { vatCodeId: vatCodeId || null }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
    include: { defaultVatCode: true },
  });

  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "ledger.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { id } = await params;
  const account = await prisma.ledgerAccount.findUnique({ where: { id } });
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });

  if (account.isSystem) {
    return Response.json({ error: "System account cannot be deleted" }, { status: 400 });
  }

  // Check if any VAT codes reference this account
  const linkedVatCodes = await prisma.vatCode.count({ where: { ledgerAccountId: id } });
  if (linkedVatCodes > 0) {
    return Response.json({ error: "Account is used by VAT codes and cannot be deleted" }, { status: 400 });
  }

  await prisma.ledgerAccount.delete({ where: { id } });
  return Response.json({ success: true });
}
